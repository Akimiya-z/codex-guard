'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadRepoConfig,
  loadLocalConfig,
  applyConfig,
  applyPreset,
  resolvePolicy,
  camelize,
  configInputName,
} = require('../src/config');

const ctx = { owner: 'o', repo: 'r', prNumber: 1, headSha: 'x'.repeat(40) };

function contentClient(yamlContent) {
  return {
    rest: {
      repos: {
        async getContent() {
          if (yamlContent === null) {
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }
          return {
            data: {
              content: Buffer.from(yamlContent, 'utf8').toString('base64'),
              encoding: 'base64',
            },
          };
        },
      },
    },
  };
}

test('camelize converts kebab-case to camelCase', () => {
  assert.equal(camelize('gate-agents-only'), 'gateAgentsOnly');
  assert.equal(camelize('todo-patterns'), 'todoPatterns');
  assert.equal(camelize('check-ci'), 'checkCi');
  assert.equal(configInputName('todo-blocking'), 'todosBlocking');
});

test('loadRepoConfig returns null on a missing file', async () => {
  const cfg = await loadRepoConfig(contentClient(null), ctx, '.github/codex-guard.yml');
  assert.equal(cfg, null);
});

test('loadRepoConfig parses YAML config', async () => {
  const cfg = await loadRepoConfig(
    contentClient('gate-agents-only: true\ntodo-patterns:\n  - TODO\n  - FIXME\n'),
    ctx,
    '.github/codex-guard.yml'
  );
  assert.deepEqual(cfg, { 'gate-agents-only': true, 'todo-patterns': ['TODO', 'FIXME'] });
});

test('loadRepoConfig rejects non-object documents', async () => {
  assert.equal(await loadRepoConfig(contentClient('[1, 2]'), ctx, 'p'), null);
  assert.equal(await loadRepoConfig(contentClient(''), ctx, 'p'), null);
});

test('applyConfig overrides workflow inputs with typed values', () => {
  const inputs = {
    gateAgentsOnly: true,
    agentLabels: ['codex-generated'],
    todoPatterns: ['TODO'],
    secretExcludePaths: [],
    failOn: [],
    checkTodos: true,
    requestChanges: false,
    commentMode: 'replace',
    configPath: '.github/codex-guard.yml',
    token: 'x',
    prNumber: '',
    // remaining defaults needed by the object:
    agentBranchPrefixes: [],
    agentKeywords: [],
    todosBlocking: true,
    checkSecrets: true,
    checkCommits: true,
    commitPattern: '',
    checkCi: true,
    ignoreCheckRunNames: [],
    ignoreLabel: '',
    postComment: true,
    softFail: false,
  };
  const out = applyConfig(inputs, {
    'gate-agents-only': false,
    'agent-labels': ['agentic', 'ci'],
    'todo-patterns': 'TODO,XXX',
    'secret-exclude-paths': 'README.md, docs/',
    'fail-on': ['todos', 'secrets'],
    'request-changes': true,
    'todo-blocking': 'false',
    'unknown-key': 'ignored',
  });
  assert.equal(out.gateAgentsOnly, false);
  assert.deepEqual(out.agentLabels, ['agentic', 'ci']);
  assert.deepEqual(out.todoPatterns, ['TODO', 'XXX']);
  assert.deepEqual(out.secretExcludePaths, ['README.md', 'docs/']);
  assert.deepEqual(out.failOn, ['todos', 'secrets']);
  assert.equal(out.requestChanges, true);
  assert.equal(out.todosBlocking, false);
  assert.equal(out.unknownKey, undefined);
  // untouched fields survive
  assert.equal(out.checkTodos, true);
});

test('applyConfig coerces valid boolean strings and ignores invalid booleans', () => {
  const inputs = { checkCi: true, softFail: false };
  assert.deepEqual(applyConfig(inputs, { 'check-ci': 'FALSE', 'soft-fail': 'true' }), {
    checkCi: false,
    softFail: true,
  });
  assert.deepEqual(applyConfig(inputs, { 'check-ci': 'sometimes' }), inputs);
});

test('applyConfig returns inputs unchanged when config is null', () => {
  const inputs = { gateAgentsOnly: true };
  assert.equal(applyConfig(inputs, null), inputs);
});

test('presets provide stable policy baselines without changing the empty default', () => {
  const base = { preset: '', softFail: false, failOn: [], todosBlocking: true };
  assert.deepEqual(applyPreset(base), base);
  assert.deepEqual(applyPreset(base, 'balanced'), {
    preset: 'balanced',
    softFail: false,
    failOn: ['secrets', 'commits', 'ci'],
    todosBlocking: false,
  });
  assert.equal(applyPreset(base, 'observe').softFail, true);
  assert.deepEqual(applyPreset(base, 'strict').failOn, ['todos', 'secrets', 'commits', 'ci']);
  assert.throws(() => applyPreset(base, 'maximum'), /preset must be one of/);
  assert.throws(() => applyPreset(base, ['strict']), /preset must be one of/);
});

test('repo preset and individual config keys override the workflow preset', () => {
  const resolved = resolvePolicy(
    { preset: 'strict', softFail: false, failOn: [], todosBlocking: true },
    { preset: 'balanced', 'soft-fail': 'true', 'fail-on': ['secrets'] }
  );
  assert.equal(resolved.preset, 'balanced');
  assert.equal(resolved.softFail, true);
  assert.deepEqual(resolved.failOn, ['secrets']);
  assert.throws(
    () => resolvePolicy(
      { preset: '', softFail: false, failOn: [], todosBlocking: true },
      { 'fail-on': ['maximum'] }
    ),
    /unknown checks: maximum/
  );
  assert.throws(
    () => resolvePolicy(
      { preset: '', softFail: false, failOn: [], todosBlocking: true },
      { 'fail-on': 1 }
    ),
    /must be a list/
  );
});

test('loadLocalConfig reads only mapping files inside the repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-policy-'));
  try {
    fs.mkdirSync(path.join(root, '.github'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github/codex-guard.yml'), 'preset: balanced\n');
    assert.deepEqual(loadLocalConfig(root, '.github/codex-guard.yml'), { preset: 'balanced' });
    assert.throws(() => loadLocalConfig(root, '../outside.yml'), /inside the repository/);
    fs.writeFileSync(path.join(root, '.github/codex-guard.yml'), '- invalid\n- shape\n');
    assert.throws(() => loadLocalConfig(root, '.github/codex-guard.yml'), /top-level YAML mapping/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
