'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRepoConfig, applyConfig, camelize } = require('../src/config');

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
    'unknown-key': 'ignored',
  });
  assert.equal(out.gateAgentsOnly, false);
  assert.deepEqual(out.agentLabels, ['agentic', 'ci']);
  assert.deepEqual(out.todoPatterns, ['TODO', 'XXX']);
  assert.deepEqual(out.secretExcludePaths, ['README.md', 'docs/']);
  assert.deepEqual(out.failOn, ['todos', 'secrets']);
  assert.equal(out.requestChanges, true);
  assert.equal(out.unknownKey, undefined);
  // untouched fields survive
  assert.equal(out.checkTodos, true);
});

test('applyConfig returns inputs unchanged when config is null', () => {
  const inputs = { gateAgentsOnly: true };
  assert.equal(applyConfig(inputs, null), inputs);
});
