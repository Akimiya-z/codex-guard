'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../src/main');
const { fakeCore, fakeClient, prContext } = require('./helpers');

const GITHUB = 'ghp_' + 'A'.repeat(36);

async function runWith({ inputs, client, context } = {}) {
  const coreImpl = fakeCore({ 'github-token': GITHUB, ...inputs });
  const result = await run({ core: coreImpl, client: client || fakeClient(), context: context || prContext() });
  return { coreImpl, result };
}

test('fails an agent PR that leaves TODOs, secrets, bad commits and red CI', async () => {
  const client = fakeClient({
    statuses: [{ context: 'ci/test', state: 'failure' }],
    checkRuns: [],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'check-ci': 'true', 'post-comment': 'false' },
  });

  assert.equal(result.result, 'fail');
  assert.equal(result.detectedAgent, true);
  assert.equal(coreImpl.calls.setFailed, 1);
  assert.match(coreImpl.calls.setFailedMsg, /Codex Guard failed/);
  const failed = coreImpl.outputs['failed-checks'];
  for (const name of ['todos', 'secrets', 'commits', 'ci']) {
    assert.ok(failed.includes(name), `expected ${name} in failed-checks: ${failed}`);
  }
  assert.equal(coreImpl.outputs['detected-agent'], 'true');
  assert.ok(Number(coreImpl.outputs['todo-count']) >= 2);
  assert.ok(Number(coreImpl.outputs['secret-count']) >= 2);
  assert.equal(Number(coreImpl.outputs['commit-count']), 2);
  assert.equal(Number(coreImpl.outputs['ci-failure-count']), 1);
});

test('passes a non-agent PR without touching the GitHub API', async () => {
  const client = fakeClient();
  const { coreImpl, result } = await runWith({
    client,
    context: prContext({
      title: 'fix: login flow',
      ref: 'feat/login',
      labels: [{ name: 'bug' }],
    }),
  });
  assert.equal(result.result, 'pass');
  assert.equal(result.detectedAgent, false);
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.equal(client.hit.size, 0);
});

test('a PR with the ignore label passes even with violations', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { coreImpl, result } = await runWith({
    client,
    context: prContext({
      labels: [{ name: 'codex-guard-ignore' }, { name: 'codex-generated' }],
    }),
  });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.equal(client.hit.size, 0);
});

test('passes a clean agent PR and reports a check run', async () => {
  const client = fakeClient({
    files: [],
    commits: [{ sha: '1', message: 'feat(auth): oidc', author: 'codex' }],
    statuses: [{ context: 'ci/test', state: 'success' }],
  });
  const { coreImpl, result } = await runWith({ client });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.ok(client.hit.has('checks.create'));
  assert.ok(client.hit.has('listFiles'));
});

test('non-blocking TODOs (todo-blocking=false) do not fail the run', async () => {
  const client = fakeClient({ statuses: [], checkRuns: [] });
  const { coreImpl, result } = await runWith({
    client,
    inputs: {
      'todo-blocking': 'false',
      'check-secrets': 'false',
      'check-commits': 'false',
      'check-ci': 'false',
    },
  });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.ok(coreImpl.calls.notice.length >= 1);
});

test('soft-fail reports findings but never fails', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'soft-fail': 'true', 'post-comment': 'false' },
  });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
});

test('skips cleanly when no PR is present and no pr-number input', async () => {
  const coreImpl = fakeCore({ 'github-token': GITHUB });
  const context = {
    repo: { owner: 'octo', repo: 'demo' },
    payload: { repository: { owner: { login: 'octo' }, name: 'demo' } },
  };
  const result = await run({ core: coreImpl, client: fakeClient(), context });
  assert.equal(result.result, 'skipped');
  assert.equal(coreImpl.outputs['result'], 'skipped');
});

test('resolves a PR from pr-number input on non-PR events', async () => {
  const client = fakeClient({ files: [], commits: [], statuses: [], checkRuns: [] });
  const coreImpl = fakeCore({
    'github-token': GITHUB,
    'gate-agents-only': 'false', // force gating so we actually run checks
    'pr-number': '9',
  });
  const context = {
    payload: { after: 'e'.repeat(40), repository: { owner: { login: 'octo' }, name: 'demo' } },
    repo: { owner: 'octo', repo: 'demo' },
  };
  const result = await run({ core: coreImpl, client, context });
  assert.equal(result.result, 'pass');
});
