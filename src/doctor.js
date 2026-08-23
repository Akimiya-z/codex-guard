'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { normalizeInline } = require('./markdown');

const DEFAULT_WORKFLOW = '.github/workflows/codex-guard.yml';
const DEFAULT_CONFIG = '.github/codex-guard.yml';
const VALID_FAIL_ON = new Set(['todos', 'secrets', 'commits', 'ci']);
const VALID_COMMENT_MODES = new Set(['replace', 'append', 'none']);
const VALID_PRESETS = new Set(['observe', 'balanced', 'strict']);
const BOOLEAN_INPUTS = new Set([
  'gate-agents-only',
  'check-todos',
  'todo-blocking',
  'check-secrets',
  'check-commits',
  'check-ci',
  'post-comment',
  'request-changes',
  'soft-fail',
  'sweep',
]);

function result(level, code, message) {
  return { level, code, message };
}

function workflowEvents(on) {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on;
  return on && typeof on === 'object' ? Object.keys(on) : [];
}

function actionSteps(workflow) {
  const found = [];
  for (const [jobName, job] of Object.entries(workflow?.jobs || {})) {
    for (const step of job?.steps || []) {
      if (/^Akimiya-z\/codex-guard@/i.test(String(step?.uses || ''))) {
        found.push({ jobName, job, step });
      }
    }
  }
  return found;
}

function permissionAllows(value, needed) {
  if (value === 'write-all') return true;
  if (value === 'read-all') return needed === 'read';
  if (needed === 'read') return value === 'read' || value === 'write';
  return value === 'write';
}

function inspectPermissions(workflow, guardStep) {
  const permissions = guardStep.job.permissions ?? workflow.permissions;
  if (!permissions) {
    return [result('error', 'permissions-missing', 'Workflow permissions are implicit; declare least-privilege permissions explicitly.')];
  }

  const required = [
    ['contents', 'read'],
    ['statuses', 'read'],
    ['checks', 'write'],
  ];
  const postComment = String(guardStep.step.with?.['post-comment'] ?? 'true') !== 'false';
  const requestChanges = String(guardStep.step.with?.['request-changes'] ?? 'false') === 'true';
  if (postComment || requestChanges) required.push(['pull-requests', 'write']);

  if (typeof permissions === 'string') {
    const missing = required.filter(([, level]) => !permissionAllows(permissions, level));
    return missing.length
      ? [result('error', 'permissions-insufficient', `${permissions} does not grant every permission Codex Guard needs.`)]
      : [result('pass', 'permissions', `Permissions are explicit via ${permissions}.`)];
  }

  const missing = required.filter(([name, level]) => !permissionAllows(permissions[name], level));
  if (missing.length) {
    return [result(
      'error',
      'permissions-insufficient',
      `Missing permissions: ${missing.map(([name, level]) => `${name}: ${level}`).join(', ')}.`
    )];
  }
  return [result('pass', 'permissions', 'Required contents, statuses, checks and PR permissions are explicit.')];
}

function parseStringList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return null;
}

function inspectConfig(config, knownInputs) {
  const checks = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return [result('error', 'config-shape', 'Policy YAML must contain a top-level mapping.')];
  }

  const unknown = Object.keys(config).filter((key) => !knownInputs.has(key));
  if (unknown.length) {
    checks.push(result('warn', 'config-unknown', `Unknown policy keys are ignored: ${unknown.join(', ')}.`));
  }
  if ('comment-mode' in config && !VALID_COMMENT_MODES.has(String(config['comment-mode']))) {
    checks.push(result('error', 'config-comment-mode', 'comment-mode must be replace, append, or none.'));
  }
  if ('preset' in config) {
    const preset = config.preset;
    if (typeof preset !== 'string' || !VALID_PRESETS.has(preset.toLowerCase())) {
      checks.push(result('error', 'config-preset', 'preset must be observe, balanced, or strict.'));
    }
  }
  if ('fail-on' in config) {
    const values = parseStringList(config['fail-on']);
    if (!values) {
      checks.push(result('error', 'config-fail-on-type', 'fail-on must be a YAML list or comma-separated string.'));
    } else {
      const invalid = values.filter((value) => !VALID_FAIL_ON.has(value));
      if (invalid.length) {
        checks.push(result('error', 'config-fail-on-value', `Unknown fail-on checks: ${invalid.join(', ')}.`));
      }
    }
  }
  for (const key of BOOLEAN_INPUTS) {
    if (!(key in config)) continue;
    const value = config[key];
    const valid = typeof value === 'boolean' ||
      (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase()));
    if (!valid) {
      checks.push(result('error', 'config-boolean', `${key} must be true or false.`));
    }
  }
  return checks.length ? checks : [result('pass', 'config', 'Policy YAML uses recognized inputs and values.')];
}

function inferPreset(step) {
  const withValues = step.with || {};
  const declared = String(withValues.preset || '').toLowerCase();
  if (VALID_PRESETS.has(declared)) return declared;
  const softFail = String(withValues['soft-fail'] ?? 'false');
  const failOn = parseStringList(withValues['fail-on'] ?? '') || [];
  if (softFail === 'true') return 'observe';
  if (failOn.length === 3 && ['secrets', 'commits', 'ci'].every((name) => failOn.includes(name))) {
    return 'balanced';
  }
  if (softFail === 'false' && failOn.length === 0) return 'strict';
  return 'custom';
}

function repoPath(root, candidate) {
  if (!candidate || path.isAbsolute(candidate)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

function inspectRepository({ root, workflowPath = DEFAULT_WORKFLOW, readFile, exists } = {}) {
  const read = readFile || ((filename) => fs.readFileSync(filename, 'utf8'));
  const fileExists = exists || fs.existsSync;
  const checks = [];
  const absoluteWorkflow = repoPath(root, workflowPath);

  if (!absoluteWorkflow) {
    checks.push(result('error', 'workflow-path', 'Workflow path must stay inside the repository.'));
    return { root, workflowPath, preset: null, checks, summary: summarize(checks) };
  }

  if (!fileExists(absoluteWorkflow)) {
    checks.push(result('error', 'workflow-missing', `${workflowPath} does not exist; run codex-guard init.`));
    return { root, workflowPath, preset: null, checks, summary: summarize(checks) };
  }

  let workflow;
  try {
    workflow = yaml.load(read(absoluteWorkflow));
  } catch (err) {
    checks.push(result('error', 'workflow-yaml', `Workflow YAML is invalid: ${err.message}`));
    return { root, workflowPath, preset: null, checks, summary: summarize(checks) };
  }
  checks.push(result('pass', 'workflow-yaml', `${workflowPath} is valid YAML.`));

  const events = workflowEvents(workflow?.on);
  if (events.includes('pull_request') || events.includes('pull_request_target')) {
    checks.push(result('pass', 'pr-trigger', 'Workflow runs for pull requests.'));
  } else {
    checks.push(result('warn', 'pr-trigger', 'No pull_request or pull_request_target trigger was found.'));
  }

  const guardSteps = actionSteps(workflow);
  if (!guardSteps.length) {
    checks.push(result('error', 'action-step', 'No Akimiya-z/codex-guard Action step was found.'));
    return { root, workflowPath, preset: null, checks, summary: summarize(checks) };
  }
  const guardStep = guardSteps[0];
  checks.push(result('pass', 'action-step', `Found ${guardStep.step.uses} in job ${guardStep.jobName}.`));

  const declaredPreset = guardStep.step.with?.preset;
  if (declaredPreset !== undefined) {
    const value = String(declaredPreset);
    if (/\$\{\{/.test(value)) {
      checks.push(result('warn', 'workflow-preset-dynamic', 'Workflow preset uses an expression and cannot be validated locally.'));
    } else if (typeof declaredPreset !== 'string' || !VALID_PRESETS.has(value.toLowerCase())) {
      checks.push(result('error', 'workflow-preset', 'Workflow preset must be observe, balanced, or strict.'));
    }
  }

  const configPath = String(guardStep.step.with?.['config-path'] || DEFAULT_CONFIG);
  const absoluteConfig = repoPath(root, configPath);
  let config = null;
  if (!absoluteConfig) {
    checks.push(result('error', 'config-path', 'config-path must stay inside the repository.'));
  } else if (!fileExists(absoluteConfig)) {
    checks.push(result('pass', 'config-absent', `No ${configPath}; workflow inputs are the policy.`));
  } else {
    try {
      config = yaml.load(read(absoluteConfig));
      const packagedAction = yaml.load(read(path.join(__dirname, '..', 'action.yml')));
      checks.push(...inspectConfig(config, new Set(Object.keys(packagedAction.inputs || {}))));
    } catch (err) {
      checks.push(result('error', 'config-yaml', `Policy YAML is invalid: ${err.message}`));
    }
  }

  const effectiveStep = {
    ...guardStep,
    step: {
      ...guardStep.step,
      with: {
        ...(guardStep.step.with || {}),
        ...(config && typeof config === 'object' && !Array.isArray(config) ? config : {}),
      },
    },
  };
  checks.push(...inspectPermissions(workflow, effectiveStep));

  const preset = inferPreset(effectiveStep.step);
  const hasNamedPreset = VALID_PRESETS.has(String(effectiveStep.step.with?.preset || '').toLowerCase());
  checks.push(result(
    'pass',
    'preset',
    hasNamedPreset
      ? `Selected policy baseline is ${preset}; individual policy keys may override it.`
      : `Effective local policy resembles the ${preset} preset.`
  ));

  return { root, workflowPath, preset, checks, summary: summarize(checks) };
}

function summarize(checks) {
  return {
    errors: checks.filter((check) => check.level === 'error').length,
    warnings: checks.filter((check) => check.level === 'warn').length,
    passed: checks.filter((check) => check.level === 'pass').length,
  };
}

function renderDoctor(report) {
  const icon = { pass: '✓', warn: '⚠', error: '✖' };
  const lines = ['Codex Guard doctor', ''];
  for (const check of report.checks) {
    lines.push(`${icon[check.level]} ${normalizeInline(check.message, 1000)}`);
  }
  lines.push(
    '',
    `Summary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.passed} passed.`
  );
  return lines.join('\n');
}

module.exports = {
  DEFAULT_WORKFLOW,
  inspectRepository,
  inspectPermissions,
  inspectConfig,
  inferPreset,
  renderDoctor,
};
