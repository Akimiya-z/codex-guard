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

test('passes a non-agent PR without gating checks', async () => {
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
  // config lookup happens, but no gating endpoints are touched
  assert.equal(client.hit.has('getContent'), true);
  assert.equal(client.hit.has('listFiles'), false);
  assert.equal(client.hit.has('listCommits'), false);
  assert.equal(client.hit.has('combinedStatus'), false);
});

test('repo config forces gating and overrides workflow inputs', async () => {
  const client = fakeClient({
    repoConfig: 'gate-agents-only: false\ncomment-mode: none\n',
  });
  const { coreImpl, result } = await runWith({
    client,
    context: prContext({
      title: 'fix: login flow',
      ref: 'feat/login',
      labels: [{ name: 'bug' }],
    }),
  });
  // gate-agents-only:false from config → even a human-looking PR is gated → messy fixtures fail
  assert.equal(result.result, 'fail');
  assert.equal(coreImpl.calls.setFailed, 1);
  assert.ok(client.hit.has('listFiles'));
});

test('fail-on: checks excluded from the list are non-blocking', async () => {
  // Files contain TODOs + secrets, but fail-on only blocks `ci` (which is green).
  const client = fakeClient({
    commits: [{ sha: '1', message: 'feat(auth): oidc', author: 'codex' }],
    statuses: [],
    repoConfig: 'fail-on: [ci]\ncomment-mode: none\n',
  });
  const { coreImpl, result } = await runWith({ client });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.equal(coreImpl.outputs['failed-checks'], '');
  assert.ok(Number(coreImpl.outputs['todo-count']) >= 2);
  assert.ok(Number(coreImpl.outputs['secret-count']) >= 2);
});

test('fail-on: only listed checks appear in failed-checks', async () => {
  const client = fakeClient({
    statuses: [{ context: 'ci/test', state: 'failure' }],
    repoConfig: 'fail-on: [ci]\n',
  });
  const { coreImpl, result } = await runWith({ client, inputs: { 'post-comment': 'false' } });
  assert.equal(result.result, 'fail');
  assert.equal(coreImpl.outputs['failed-checks'], 'ci');
});

test('findings-json output carries the full report', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { coreImpl } = await runWith({
    client,
    inputs: { 'post-comment': 'false' },
  });
  const parsed = JSON.parse(coreImpl.outputs['findings-json']);
  assert.ok(Array.isArray(parsed.todos) && parsed.todos.length >= 2);
  assert.ok(Array.isArray(parsed.secrets) && parsed.secrets.length >= 2);
  assert.ok(Array.isArray(parsed.commits) && parsed.commits.length >= 2);
  assert.ok(parsed.ci.failed.some((f) => f.name === 'ci/test'));
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
  // skipped before any gating endpoint is touched
  assert.equal(client.hit.has('listFiles'), false);
  assert.equal(client.hit.has('combinedStatus'), false);
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

test('request-changes submits a REQUEST_CHANGES review on blocking findings', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'request-changes': 'true' },
  });
  assert.equal(result.result, 'fail');
  assert.ok(client.hit.has('createReview'));
  // default comment-mode 'replace' still posts the report comment on failure
  assert.ok(client.hit.has('createComment'));
});

test('comment-mode none suppresses the PR comment', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { result } = await runWith({
    client,
    inputs: { 'post-comment': 'true', 'comment-mode': 'none' },
  });
  assert.equal(result.result, 'fail');
  assert.ok(!client.hit.has('createComment'));
  assert.ok(!client.hit.has('updateComment'));
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
