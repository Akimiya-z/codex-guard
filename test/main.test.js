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

test('Action presets select blocking behavior and expose the selected baseline', async () => {
  const balanced = await runWith({
    inputs: { preset: 'balanced', 'post-comment': 'false' },
  });
  assert.equal(balanced.result.result, 'fail');
  assert.equal(balanced.coreImpl.outputs['policy-preset'], 'balanced');
  assert.equal(balanced.coreImpl.outputs['failed-checks'].includes('todos'), false);
  assert.ok(balanced.coreImpl.outputs['failed-checks'].includes('secrets'));

  const observe = await runWith({
    inputs: { preset: 'observe', 'post-comment': 'false' },
  });
  assert.equal(observe.result.result, 'pass');
  assert.equal(observe.coreImpl.calls.setFailed, 0);
  assert.equal(observe.coreImpl.outputs['policy-preset'], 'observe');
});

test('repo policy preset and keys override the workflow preset', async () => {
  const client = fakeClient({
    repoConfig: 'preset: observe\nfail-on: [secrets]\n',
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { preset: 'strict', 'post-comment': 'false' },
  });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.outputs['policy-preset'], 'observe');
  const parsed = JSON.parse(coreImpl.outputs['findings-json']);
  assert.equal(parsed.policy.preset, 'observe');
});

test('invalid Action preset fails instead of silently selecting a policy', async () => {
  await assert.rejects(
    () => runWith({ inputs: { preset: 'maximum' } }),
    /preset must be one of/
  );
  await assert.rejects(
    () => runWith({ inputs: { 'fail-on': 'maximum' } }),
    /unknown checks: maximum/
  );
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
  assert.equal(parsed.coverage.enabled, true);
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
  assert.equal(coreImpl.outputs['content-scan-coverage'], '0/0');
  assert.equal(coreImpl.outputs['unscanned-file-count'], '0');
});

test('missing GitHub patches are visible and non-blocking', async () => {
  const client = fakeClient({
    files: [{
      filename: 'assets/large.bin',
      status: 'modified',
      additions: 100,
    }],
    commits: [{ sha: '1', message: 'feat: add asset', author: 'codex' }],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'post-comment': 'false' },
  });

  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.equal(coreImpl.outputs['content-scan-coverage'], '0/1');
  assert.equal(coreImpl.outputs['unscanned-file-count'], '1');
  assert.equal(client.checkBodies[0].conclusion, 'neutral');
  assert.match(client.checkBodies[0].output.summary, /coverage is incomplete/);
  assert.match(client.checkBodies[0].output.summary, /assets\/large\.bin/);
  const parsed = JSON.parse(coreImpl.outputs['findings-json']);
  assert.equal(parsed.coverage.scanned, 0);
  assert.equal(parsed.coverage.unscanned[0].file, 'assets/large.bin');
});

test('coverage reporting is disabled with both content checks', async () => {
  const client = fakeClient({
    files: [{ filename: 'large.txt', status: 'modified', additions: 100 }],
    commits: [{ sha: '1', message: 'feat: add asset', author: 'codex' }],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: {
      'check-todos': 'false',
      'check-secrets': 'false',
      'post-comment': 'false',
    },
  });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.outputs['content-scan-coverage'], 'disabled');
  assert.equal(client.checkBodies[0].conclusion, 'success');
});

test('one unavailable CI source is visible and neutral instead of green', async () => {
  const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
  const client = fakeClient({
    files: [],
    commits: [{ sha: '1', message: 'feat: clean', author: 'codex' }],
    statusError: forbidden,
    checkRuns: [{ name: 'build', status: 'completed', conclusion: 'success' }],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'post-comment': 'false' },
  });

  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.calls.setFailed, 0);
  assert.equal(client.checkBodies[0].conclusion, 'neutral');
  assert.match(client.checkBodies[0].output.summary, /CI visibility is incomplete/);
  const parsed = JSON.parse(coreImpl.outputs['findings-json']);
  assert.equal(parsed.ci.complete, false);
  assert.equal(parsed.ci.errors[0].source, 'commit statuses');
});

test('both unavailable CI sources fail closed', async () => {
  const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
  const client = fakeClient({
    files: [],
    commits: [{ sha: '1', message: 'feat: clean', author: 'codex' }],
    statusError: forbidden,
    checkRunsError: forbidden,
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'post-comment': 'false' },
  });

  assert.equal(result.result, 'fail');
  assert.equal(coreImpl.calls.setFailed, 1);
  assert.equal(coreImpl.outputs['failed-checks'], 'ci');
});

test('pending external CI is neutral and never reported as green', async () => {
  const client = fakeClient({
    files: [],
    commits: [{ sha: '1', message: 'feat: clean', author: 'codex' }],
    checkRuns: [{ name: 'build', status: 'in_progress', conclusion: null }],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'post-comment': 'false' },
  });

  assert.equal(result.result, 'pass');
  assert.equal(client.checkBodies[0].conclusion, 'neutral');
  assert.match(client.checkBodies[0].output.summary, /still pending/);
  assert.doesNotMatch(client.checkBodies[0].output.summary, /All checks passed/);
  const parsed = JSON.parse(coreImpl.outputs['findings-json']);
  assert.equal(parsed.ci.settled, false);
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
  assert.equal(client.checkBodies.length, 1);
  assert.equal(client.checkBodies[0].conclusion, 'neutral');
  assert.match(client.checkBodies[0].output.summary, /observe mode/);
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

// ---- Sweep mode (workflow_dispatch) ---------------------------------------

function sweepContext() {
  return {
    repo: { owner: 'octo', repo: 'demo' },
    eventName: 'workflow_dispatch',
    payload: { repository: { owner: { login: 'octo' }, name: 'demo' } },
  };
}

function sweepPrs() {
  return [
    {
      number: 10,
      title: 'feat: sync via codex (generated by Codex)',
      head: { ref: 'codex/sync', sha: 'e'.repeat(40) },
      base: { ref: 'main' },
      labels: [],
    },
    {
      number: 11,
      title: 'fix: login flow',
      head: { ref: 'feat/login', sha: 'f'.repeat(40) },
      base: { ref: 'main' },
      labels: [],
    },
  ];
}

test('sweep mode scans only agent PRs and reports', async () => {
  const client = fakeClient({ openPrs: sweepPrs() });
  const coreImpl = fakeCore({ 'github-token': GITHUB, sweep: 'true' });
  const result = await run({ core: coreImpl, client, context: sweepContext() });

  assert.equal(result.result, 'sweep');
  assert.equal(coreImpl.outputs['sweep-scanned'], '1');
  assert.equal(coreImpl.outputs['sweep-failed'], '1');
  const report = coreImpl.outputs['sweep-report'];
  assert.ok(report.includes('#10'));
  assert.ok(report.includes('#11'));
  assert.match(report, /skipped .*not agent-generated/);
  const parsed = JSON.parse(coreImpl.outputs['sweep-json']);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, 10);
  assert.ok(parsed[0].counts.secrets >= 2);
  assert.equal(parsed[0].coverage.enabled, true);
});

test('workflow_dispatch event sweeps automatically without sweep input', async () => {
  const client = fakeClient({ openPrs: sweepPrs() });
  const coreImpl = fakeCore({ 'github-token': GITHUB });
  const result = await run({ core: coreImpl, client, context: sweepContext() });
  assert.equal(result.result, 'sweep');
  assert.ok(client.hit.has('pulls.list'));
});

test('sweep-label scans only PRs carrying the configured label', async () => {
  const prs = [
    {
      number: 20,
      title: 'Generated by Codex: labeled',
      head: { ref: 'codex/labeled', sha: 'a'.repeat(40) },
      base: { ref: 'main' },
      labels: [{ name: 'needs-attention' }],
    },
    {
      number: 21,
      title: 'Generated by Codex: unlabeled',
      head: { ref: 'codex/unlabeled', sha: 'b'.repeat(40) },
      base: { ref: 'main' },
      labels: [],
    },
  ];
  const client = fakeClient({ openPrs: prs });
  const coreImpl = fakeCore({
    'github-token': GITHUB,
    sweep: 'true',
    'sweep-label': 'needs-attention',
  });
  const result = await run({ core: coreImpl, client, context: sweepContext() });

  assert.equal(result.scanned.length, 1);
  assert.equal(result.scanned[0].pr.number, 20);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /missing sweep label/);
  assert.match(coreImpl.outputs['sweep-report'], /#21/);
});

test('sweep mode never posts comments or check runs per PR', async () => {
  const client = fakeClient({ openPrs: sweepPrs() });
  const coreImpl = fakeCore({ 'github-token': GITHUB, sweep: 'true' });
  await run({ core: coreImpl, client, context: sweepContext() });
  assert.equal(client.hit.has('createComment'), false);
  assert.equal(client.hit.has('checks.create'), false);
  assert.equal(client.hit.has('createReview'), false);
});

test('notify-users mentions users in the report comment on failure', async () => {
  const client = fakeClient({ statuses: [{ context: 'ci/test', state: 'failure' }] });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'notify-users': 'alice,bob' },
  });
  assert.equal(result.result, 'fail');
  assert.ok(client.bodies.length >= 1);
  assert.ok(client.bodies[0].includes('@alice @bob'));
  assert.ok(client.bodies[0].includes('please review'));
});

test('notify-users is ignored when passing', async () => {
  const client = fakeClient({ files: [], commits: [], statuses: [] });
  const { result } = await runWith({
    client,
    inputs: { 'notify-users': 'alice' },
  });
  assert.equal(result.result, 'pass');
  assert.equal(client.bodies.length, 0);
});

// ---- AGENTS.md-aware commit convention -------------------------------------

test('AGENTS.md commit convention is used as a last-resort default', async () => {
  const client = fakeClient({
    files: [],
    agentsMd: 'Commits must match `^JIRA-[0-9]+: .+$`.\n',
    commits: [{ sha: '1', message: 'JIRA-123: add auth', author: 'codex' }],
    statuses: [],
  });
  const { coreImpl, result } = await runWith({ client, inputs: { 'post-comment': 'false' } });
  assert.equal(result.result, 'pass');
  assert.equal(coreImpl.outputs['commit-count'], '0');
  assert.ok(coreImpl.calls.info.some((m) => /commit pattern from AGENTS.md/.test(m)));
});

test('explicit input wins over AGENTS.md', async () => {
  const client = fakeClient({
    files: [],
    agentsMd: 'Commits must match `^JIRA-[0-9]+: .+$`.\n',
    commits: [{ sha: '1', message: 'JIRA-123: add auth', author: 'codex' }],
    statuses: [],
  });
  const { coreImpl, result } = await runWith({
    client,
    inputs: { 'commit-pattern': '^\\w+$', 'post-comment': 'false' },
  });
  assert.equal(result.result, 'fail');
  assert.ok(Number(coreImpl.outputs['commit-count']) >= 1);
});
