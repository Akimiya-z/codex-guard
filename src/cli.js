#!/usr/bin/env node
'use strict';

/**
 * codex-guard CLI — dry-run the TODO + secret + commit checks locally,
 * before CI. Feed it a unified diff (file or `git diff <ref>`), get the same
 * findings the GitHub Action would report, with the same blocking rules.
 *
 * Usage:
 *   npx --yes codex-guard init [--preset observe|balanced|strict] [--force]
 *   npx --yes codex-guard doctor [--json]
 *   node src/cli.js --diff <patch-file> [options]
 *   node src/cli.js --git origin/main [--commits] [options]
 *
 * Options:
 *   --patterns TODO,FIXME,XXX   markers to flag (default: TODO,FIXME,XXX,HACK,WIP)
 *   --exclude docs/,test/       file path substrings to skip in the secret scan
 *   --fail-on todos,secrets,... which checks block (default: legacy — todos &
 *                               secrets block, commits block when checked)
 *   --warn-todos                TODO findings are non-blocking
 *   --commits                   with --git: also check commit subjects in range
 *   --json                      print the raw report as JSON, nothing else
 *   -h, --help                  this help
 *
 * Exit codes: 0 = no blocking findings, 1 = blocking findings, 2 = usage error.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { findTodos } = require('./checks/todos');
const { findSecrets } = require('./checks/secrets');
const { findBadCommits } = require('./checks/commits');
const { collectUntrackedFiles } = require('./local-files');
const { DEFAULT_WORKFLOW, inspectRepository, renderDoctor } = require('./doctor');
const { normalizeInline } = require('./markdown');
const {
  PRESET_NAMES,
  applyPreset,
  loadLocalConfig,
  resolvePolicy,
  validatePolicy,
} = require('./config');

const USAGE = `codex-guard — local dry-run

USAGE
  codex-guard init [--preset <mode>] [--force]         # add the GitHub Action
  codex-guard doctor [--workflow <path>] [--json]      # diagnose local setup
  node src/cli.js --diff <patch-file> [options]
  node src/cli.js --git [<ref>] [--commits] [options]  # tracked + untracked changes

OPTIONS
  --patterns TODO,FIXME,XXX   todo markers to flag (default TODO,FIXME,XXX,HACK,WIP)
  --exclude docs/,test/       path substrings to skip in the secret scan
  --fail-on todos,secrets,..  checks that block (default: legacy behavior)
  --preset <mode>             observe, balanced, or strict policy baseline
  --config <path>             local policy path (default .github/codex-guard.yml)
  --no-config                 do not load the repository policy in --git mode
  --warn-todos                treat TODO findings as non-blocking
  --commits                   with --git: check commit subjects in range
  --json                      emit the raw JSON report only
  -h, --help                  show this help
`;

const INIT_USAGE = `codex-guard init — add Codex Guard to this repository

USAGE
  codex-guard init [--preset observe|balanced|strict] [--force]
  codex-guard init --strict [--force]  # alias for --preset strict

OPTIONS
  --preset <mode>             observe (default), balanced, or strict
  --strict                    alias for --preset strict
  --force                     replace an existing Codex Guard workflow
  -h, --help                  show this help
`;

const DOCTOR_USAGE = `codex-guard doctor — diagnose the local Codex Guard setup

USAGE
  codex-guard doctor [--workflow <path>] [--json]

OPTIONS
  --workflow <path>           workflow to inspect (default: ${DEFAULT_WORKFLOW})
  --json                      emit the diagnostic report as JSON
  -h, --help                  show this help
`;

const WORKFLOW_PATH = '.github/workflows/codex-guard.yml';

class UsageError extends Error {}

function parseInitArgs(argv) {
  const opts = { preset: 'observe', strict: false, force: false, help: false };
  let explicitPreset = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--preset': {
        if (i + 1 >= argv.length) throw new UsageError('missing value for --preset');
        const preset = argv[++i];
        if (!['observe', 'balanced', 'strict'].includes(preset)) {
          throw new UsageError(`unknown preset: ${preset}`);
        }
        if (opts.strict && preset !== 'strict') {
          throw new UsageError('--strict conflicts with a non-strict preset');
        }
        opts.preset = preset;
        opts.strict = preset === 'strict';
        explicitPreset = true;
        break;
      }
      case '--strict':
        if (explicitPreset && opts.preset !== 'strict') {
          throw new UsageError('--strict conflicts with a non-strict preset');
        }
        opts.preset = 'strict';
        opts.strict = true;
        break;
      case '--force': opts.force = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new UsageError(`unknown init option: ${arg}`);
    }
  }
  return opts;
}

function renderInitWorkflow({ preset, strict = false } = {}) {
  const mode = preset || (strict ? 'strict' : 'observe');
  const observing = mode === 'observe';
  const balanced = mode === 'balanced';
  return `# Generated by codex-guard init
# ${observing ? 'Observe findings first; switch presets when the policy is tuned.' : balanced ? 'Block secrets, commit hygiene, and red CI; report TODOs as warnings.' : 'Enforce all default findings immediately.'}
name: Codex Guard
on:
  pull_request:

permissions:
  contents: read
  statuses: read
  pull-requests: write
  checks: write

jobs:
  codex-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: Akimiya-z/codex-guard@v1
        with:
          preset: '${mode}'
`;
}

function runInit(argv, { execGit }) {
  let opts;
  try {
    opts = parseInitArgs(argv);
  } catch (err) {
    process.stderr.write(`codex-guard: ${normalizeInline(err.message)}\n\n${INIT_USAGE}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(INIT_USAGE);
    return 0;
  }

  let root;
  try {
    root = execGit(['rev-parse', '--show-toplevel']).trim();
  } catch (_err) {
    process.stderr.write('codex-guard: run init inside a Git repository\n');
    return 2;
  }
  if (!root) {
    process.stderr.write('codex-guard: Git returned an empty repository root\n');
    return 2;
  }

  const workflow = path.join(root, WORKFLOW_PATH);
  if (fs.existsSync(workflow) && !opts.force) {
    process.stderr.write(
      `codex-guard: ${WORKFLOW_PATH} already exists; use --force to replace it\n`
    );
    return 2;
  }

  try {
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    fs.writeFileSync(workflow, renderInitWorkflow(opts), 'utf8');
  } catch (err) {
    process.stderr.write(
      `codex-guard: could not write ${WORKFLOW_PATH}: ${normalizeInline(err.message)}\n`
    );
    return 2;
  }

  const mode = opts.preset === 'observe'
    ? 'observe (non-blocking)'
    : opts.preset === 'balanced'
      ? 'balanced (TODOs warn; secrets, commits, and CI block)'
      : 'strict (blocking)';
  process.stdout.write(
    `✓ Created ${WORKFLOW_PATH} in ${mode} mode.\n` +
    `  Next: git add ${WORKFLOW_PATH} && git commit -m "ci: add Codex Guard"\n` +
    (opts.preset !== 'observe'
      ? ''
      : '  After a few representative PRs, rerun init with --preset balanced or strict --force.\n')
  );
  return 0;
}

function parseDoctorArgs(argv) {
  const opts = { workflow: DEFAULT_WORKFLOW, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--workflow':
        if (i + 1 >= argv.length) throw new UsageError('missing value for --workflow');
        opts.workflow = argv[++i];
        break;
      case '--json': opts.json = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new UsageError(`unknown doctor option: ${arg}`);
    }
  }
  return opts;
}

function runDoctor(argv, { execGit, readFile, exists }) {
  let opts;
  try {
    opts = parseDoctorArgs(argv);
  } catch (err) {
    process.stderr.write(`codex-guard: ${normalizeInline(err.message)}\n\n${DOCTOR_USAGE}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(DOCTOR_USAGE);
    return 0;
  }

  let root;
  try {
    root = execGit(['rev-parse', '--show-toplevel']).trim();
  } catch {
    process.stderr.write('codex-guard: run doctor inside a Git repository\n');
    return 2;
  }

  const report = inspectRepository({
    root,
    workflowPath: opts.workflow,
    readFile,
    exists,
  });
  process.stdout.write((opts.json ? JSON.stringify(report, null, 2) : renderDoctor(report)) + '\n');
  return report.summary.errors ? 1 : 0;
}

function parseArgs(argv) {
  const opts = {
    diffFile: null,
    git: false,
    gitRef: null,
    patterns: null,
    exclude: [],
    excludeExplicit: false,
    failOn: [],
    failOnExplicit: false,
    preset: null,
    configPath: '.github/codex-guard.yml',
    configExplicit: false,
    noConfig: false,
    checkCommits: false,
    warnTodos: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new UsageError(`missing value for ${arg}`);
      return argv[++i];
    };
    switch (arg) {
      case '--diff': opts.diffFile = next(); break;
      case '--git':
        // `--git` with no ref scans uncommitted changes (git diff HEAD).
        opts.git = true;
        if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.gitRef = argv[++i];
        break;
      case '--patterns': opts.patterns = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--exclude':
        opts.exclude = next().split(',').map((s) => s.trim()).filter(Boolean);
        opts.excludeExplicit = true;
        break;
      case '--fail-on':
        opts.failOn = next().split(',').map((s) => s.trim()).filter(Boolean);
        opts.failOnExplicit = true;
        break;
      case '--preset':
        opts.preset = next().toLowerCase();
        if (!PRESET_NAMES.includes(opts.preset)) {
          throw new UsageError(`unknown preset: ${opts.preset}`);
        }
        break;
      case '--config':
        opts.configPath = next();
        opts.configExplicit = true;
        break;
      case '--no-config': opts.noConfig = true; break;
      case '--commits': opts.checkCommits = true; break;
      case '--warn-todos': opts.warnTodos = true; break;
      case '--json': opts.json = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new UsageError(`unknown option: ${arg}`);
    }
  }
  if (!opts.help && !opts.diffFile && !opts.git) {
    throw new UsageError('provide --diff <file> or --git [<ref>]');
  }
  if (opts.noConfig && opts.configExplicit) {
    throw new UsageError('--config and --no-config cannot be used together');
  }
  return opts;
}

/** Split a `git diff` stream into { filename, patch } entries. */
function diffToFiles(diff) {
  const chunks = String(diff).split(/(?=^diff --git )/m).filter((c) => c.trim());
  const files = [];
  for (const chunk of chunks) {
    const m = /^\+\+\+ b\/(.+)$/m.exec(chunk);
    if (!m) continue; // rename/mode-only entries have no content patch
    const hunkStart = chunk.search(/^@@/m);
    files.push({ filename: m[1], patch: hunkStart >= 0 ? chunk.slice(hunkStart) : '' });
  }
  return files;
}

function evaluate({
  files,
  commits,
  patterns,
  exclude,
  failOn,
  warnTodos,
  checkTodos = true,
  checkSecrets = true,
}) {
  const todos = checkTodos ? findTodos(files, patterns) : [];
  const secrets = checkSecrets ? findSecrets(files, exclude) : [];
  const badCommits = commits ? findBadCommits(commits, {}) : [];

  const triggered = [];
  const blocks = (name) =>
    failOn.length ? failOn.includes(name) : name !== 'todos' || !warnTodos;
  if (blocks('todos') && todos.length) triggered.push('todos');
  if (blocks('secrets') && secrets.length) triggered.push('secrets');
  if (commits && blocks('commits') && badCommits.length) triggered.push('commits');
  return { todos, secrets, commits: badCommits, triggered };
}

function renderHuman(res, { untrackedCount = 0, unscanned = [], observing = false } = {}) {
  const lines = [];
  const section = (title, rows, fmt) => {
    if (!rows.length) return;
    lines.push(`✖ ${title} (${rows.length})`);
    for (const row of rows.slice(0, 10)) lines.push(`  ${fmt(row)}`);
    if (rows.length > 10) lines.push(`  …and ${rows.length - 10} more`);
  };
  section(
    'unfinished-work markers',
    res.todos,
    (f) => `${normalizeInline(f.file, 350)}:${f.line} — ${normalizeInline(f.marker, 80)}: ${normalizeInline(f.text)}`
  );
  section(
    'potential secrets',
    res.secrets,
    (f) => `${normalizeInline(f.file, 350)}:${f.line} — ${normalizeInline(f.type, 120)} (${normalizeInline(f.secret, 200)})`
  );
  section(
    'non-conforming commits',
    res.commits,
    (f) => `${normalizeInline(f.sha, 40).slice(0, 7)} — "${normalizeInline(f.subject)}" (${normalizeInline(f.author, 120)})`
  );

  if (unscanned.length) {
    lines.push(`⚠ unscanned untracked files (${unscanned.length})`);
    for (const item of unscanned.slice(0, 10)) {
      lines.push(`  ${normalizeInline(item.file, 350)} — ${normalizeInline(item.reason, 160)}`);
    }
    if (unscanned.length > 10) lines.push(`  …and ${unscanned.length - 10} more`);
  }

  const status = res.triggered.length
    ? observing
      ? `⚠ findings observed (non-blocking): ${res.triggered.join(', ')}`
      : `✖ blocked by: ${res.triggered.join(', ')}`
    : `✓ no blocking findings`;
  lines.push(status);
  if (untrackedCount) lines.push(`  included ${untrackedCount} untracked file(s)`);
  return lines.join('\n');
}

function resolveCliPolicy(opts, config) {
  const base = {
    preset: '',
    todoPatterns: ['TODO', 'FIXME', 'XXX', 'HACK', 'WIP'],
    secretExcludePaths: [],
    failOn: [],
    todosBlocking: true,
    checkTodos: true,
    checkSecrets: true,
    softFail: false,
  };
  let policy = resolvePolicy(base, config);
  if (opts.preset) policy = applyPreset(policy, opts.preset);
  if (opts.patterns !== null) policy.todoPatterns = opts.patterns;
  if (opts.excludeExplicit) policy.secretExcludePaths = opts.exclude;
  if (opts.failOnExplicit) policy.failOn = opts.failOn;
  if (opts.warnTodos) {
    policy.todosBlocking = false;
    policy.failOn = policy.failOn.filter((name) => name !== 'todos');
  }
  return validatePolicy(policy);
}

function main(argv, io = {}) {
  const readFile = io.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const execGit =
    io.execGit ||
    ((args) =>
      execFileSync('git', args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }));

  if (argv[0] === 'init') return runInit(argv.slice(1), { execGit });
  if (argv[0] === 'doctor') {
    return runDoctor(argv.slice(1), {
      execGit,
      readFile,
      exists: io.exists || fs.existsSync,
    });
  }

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`codex-guard: ${normalizeInline(err.message)}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  let diff;
  let commits = null;
  let localConfig = null;
  let repoRoot = null;
  let untracked = { files: [], skipped: [] };
  if (opts.diffFile) {
    diff = readFile(opts.diffFile);
  } else {
    const ref = opts.gitRef || 'HEAD';
    // Removed files cannot contain added-line findings. Excluding them keeps
    // large dependency-removal PRs from filling child_process output buffers.
    try {
      diff = execGit(['diff', '--unified=0', '--diff-filter=ACMR', ref]);
      repoRoot = execGit(['rev-parse', '--show-toplevel']).trim();
      if (!repoRoot) throw new Error('Git returned an empty repository root');
      untracked = collectUntrackedFiles({
        execGit,
        root: repoRoot,
        readBuffer: io.readBuffer,
        statFile: io.statFile,
      });
      if (opts.checkCommits) {
        const subjects = execGit(['log', '--format=%s', `${ref}..HEAD`])
          .split('\n')
          .filter(Boolean);
        commits = subjects.map((message, i) => ({ sha: `local${i}`, message, author: 'local' }));
      }
    } catch (err) {
      process.stderr.write(`codex-guard: Git scan failed: ${normalizeInline(err.message)}\n`);
      return 2;
    }
  }

  try {
    if (!opts.noConfig && (opts.git || opts.configExplicit)) {
      repoRoot = repoRoot || execGit(['rev-parse', '--show-toplevel']).trim();
      if (!repoRoot) throw new Error('Git returned an empty repository root');
      localConfig = loadLocalConfig(repoRoot, opts.configPath, {
        readFile,
        exists: io.exists || fs.existsSync,
      });
    }
  } catch (err) {
    process.stderr.write(`codex-guard: local policy failed: ${normalizeInline(err.message)}\n`);
    return 2;
  }

  const files = diffToFiles(diff).concat(untracked.files);
  let policy;
  try {
    policy = resolveCliPolicy(opts, localConfig);
  } catch (err) {
    process.stderr.write(`codex-guard: local policy failed: ${normalizeInline(err.message)}\n`);
    return 2;
  }
  const res = evaluate({
    files,
    commits,
    patterns: policy.todoPatterns,
    exclude: policy.secretExcludePaths,
    failOn: policy.failOn,
    warnTodos: !policy.todosBlocking,
    checkTodos: policy.checkTodos,
    checkSecrets: policy.checkSecrets,
  });

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          files: files.length,
          untrackedFiles: untracked.files.length,
          unscannedFiles: untracked.skipped,
          policy: {
            preset: policy.preset || 'custom',
            config: localConfig ? opts.configPath : null,
            observing: policy.softFail,
          },
          todos: res.todos,
          secrets: res.secrets,
          commits: res.commits,
          blockedBy: res.triggered,
        },
        null,
        2
      ) + '\n'
    );
  } else {
    process.stdout.write(renderHuman(res, {
      untrackedCount: untracked.files.length,
      unscanned: untracked.skipped,
      observing: policy.softFail,
    }) + '\n');
  }
  return res.triggered.length && !policy.softFail ? 1 : 0;
}

module.exports = {
  main,
  parseArgs,
  parseInitArgs,
  parseDoctorArgs,
  renderInitWorkflow,
  diffToFiles,
  evaluate,
  renderHuman,
  resolveCliPolicy,
  USAGE,
  INIT_USAGE,
  DOCTOR_USAGE,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
