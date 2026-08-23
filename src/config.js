'use strict';

const fs = require('node:fs');
const pathModule = require('node:path');
const yaml = require('js-yaml');

const PRESET_NAMES = ['observe', 'balanced', 'strict'];
const ALL_CHECKS = ['todos', 'secrets', 'commits', 'ci'];

// Converts kebab-case config keys (`todo-patterns`) to the camelCase input
// names used internally (`todoPatterns`), so one config can mirror action.yml.
function camelize(key) {
  return key.replace(/-([a-z0-9])/gi, (_, c) => c.toUpperCase());
}

function configInputName(key) {
  // The public input is singular (`todo-blocking`), while the established
  // internal field is `todosBlocking`.
  return key === 'todo-blocking' ? 'todosBlocking' : camelize(key);
}

// Inputs that come from the config as YAML lists (also accepted as CSV strings).
const LIST_INPUTS = new Set([
  'agentLabels',
  'agentBranchPrefixes',
  'agentKeywords',
  'todoPatterns',
  'secretExcludePaths',
  'ignoreCheckRunNames',
  'failOn',
]);

const BOOLEAN_INPUTS = new Set([
  'gateAgentsOnly',
  'checkTodos',
  'todosBlocking',
  'checkSecrets',
  'checkCommits',
  'checkCi',
  'postComment',
  'requestChanges',
  'softFail',
  'sweep',
]);

function applyPreset(inputs, preset = inputs?.preset) {
  if (preset !== undefined && preset !== null && typeof preset !== 'string') {
    throw new Error(`preset must be one of: ${PRESET_NAMES.join(', ')}`);
  }
  const name = String(preset || '').trim().toLowerCase();
  if (!name) return { ...inputs, preset: '' };
  if (!PRESET_NAMES.includes(name)) {
    throw new Error(`preset must be one of: ${PRESET_NAMES.join(', ')}`);
  }

  const out = { ...inputs, preset: name };
  if (name === 'observe') {
    out.softFail = true;
    out.failOn = ALL_CHECKS.slice();
    out.todosBlocking = true;
  } else if (name === 'balanced') {
    out.softFail = false;
    out.failOn = ['secrets', 'commits', 'ci'];
    out.todosBlocking = false;
  } else {
    out.softFail = false;
    out.failOn = ALL_CHECKS.slice();
    out.todosBlocking = true;
  }
  return out;
}

function validatePolicy(inputs) {
  if (inputs?.failOn !== undefined && !Array.isArray(inputs.failOn)) {
    throw new Error('fail-on must be a list or comma-separated string');
  }
  const failOn = inputs?.failOn || [];
  const invalid = failOn.filter((name) => !ALL_CHECKS.includes(name));
  if (invalid.length) {
    throw new Error(`fail-on contains unknown checks: ${invalid.join(', ')}`);
  }
  return inputs;
}

/**
 * Load `.github/codex-guard.yml` (default branch) and parse it.
 * Returns null when the file is absent, unreadable, or not a flat object —
 * the workflow inputs are always the fallback.
 */
async function loadRepoConfig(octokit, ctx, path) {
  if (!octokit || !path) return null;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: ctx.owner,
      repo: ctx.repo,
      path,
    });
    const raw = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
    const parsed = yaml.load(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null; // absent file or unreadable → fall back to workflow inputs
  }
}

/**
 * Overlay a parsed config object onto the workflow inputs. Unknown keys are
 * ignored (typo tolerant); keys map kebab-case → camelCase and keep their type.
 */
function applyConfig(inputs, config) {
  if (!config) return inputs;
  const out = { ...inputs };
  for (const [key, value] of Object.entries(config)) {
    const camel = configInputName(key);
    if (!(camel in out)) continue;
    if (BOOLEAN_INPUTS.has(camel)) {
      if (typeof value === 'boolean') {
        out[camel] = value;
      } else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
        out[camel] = value.toLowerCase() === 'true';
      }
    } else if (Array.isArray(value)) {
      out[camel] = value.map((v) => String(v)).filter((s) => s.trim() !== '');
    } else if (LIST_INPUTS.has(camel) && typeof value === 'string') {
      out[camel] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (typeof value === 'string' || typeof value === 'boolean') {
      out[camel] = value;
    } else if (typeof value === 'number') {
      out[camel] = String(value);
    }
  }
  return out;
}

/** Apply a workflow preset, then a repo-config preset, then repo overrides. */
function resolvePolicy(inputs, config) {
  let out = applyPreset(inputs, inputs?.preset);
  if (config && Object.hasOwn(config, 'preset')) {
    out = applyPreset(out, config.preset);
  }
  return validatePolicy(applyConfig(out, config));
}

/** Load a local policy file without allowing paths outside the repository. */
function loadLocalConfig(root, configPath, { readFile, exists } = {}) {
  const candidate = String(configPath || '.github/codex-guard.yml');
  if (pathModule.isAbsolute(candidate)) {
    throw new Error('config path must stay inside the repository');
  }
  const resolvedRoot = pathModule.resolve(root);
  const resolved = pathModule.resolve(resolvedRoot, candidate);
  if (!resolved.startsWith(`${resolvedRoot}${pathModule.sep}`)) {
    throw new Error('config path must stay inside the repository');
  }
  const fileExists = exists || fs.existsSync;
  if (!fileExists(resolved)) return null;
  const read = readFile || ((filename) => fs.readFileSync(filename, 'utf8'));
  const parsed = yaml.load(read(resolved));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('local policy must contain a top-level YAML mapping');
  }
  return parsed;
}

module.exports = {
  PRESET_NAMES,
  loadRepoConfig,
  loadLocalConfig,
  applyConfig,
  applyPreset,
  resolvePolicy,
  validatePolicy,
  camelize,
  configInputName,
  BOOLEAN_INPUTS,
};
