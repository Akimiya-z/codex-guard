'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateCi } = require('../src/checks/ci');

test('all green', () => {
  const r = evaluateCi({
    statuses: [{ context: 'ci/test', state: 'success' }],
    checkRuns: [{ name: 'build', conclusion: 'success', status: 'completed' }],
  });
  assert.equal(r.failed.length, 0);
  assert.equal(r.pending.length, 0);
  assert.equal(r.settled, true);
  assert.match(r.report, /green/);
});

test('flags failing commit statuses and check runs', () => {
  const r = evaluateCi({
    statuses: [{ context: 'ci/unit', state: 'failure' }],
    checkRuns: [{ name: 'build', conclusion: 'failure', status: 'completed' }],
  });
  assert.deepEqual(
    r.failed.map((f) => f.name),
    ['ci/unit', 'build']
  );
});

test('treats every incomplete GitHub check status as pending', () => {
  const r = evaluateCi({
    statuses: [],
    checkRuns: [
      { name: 'lint', status: 'in_progress' },
      { name: 'deploy', status: 'waiting' },
      { name: 'approval', status: 'requested' },
      { name: 'done', conclusion: 'success', status: 'completed' },
    ],
  });
  assert.equal(r.failed.length, 0);
  assert.deepEqual(r.pending.map((p) => p.name), ['lint', 'deploy', 'approval']);
  assert.equal(r.settled, false);
});

test('every non-success completed conclusion is handled explicitly', () => {
  const failing = [
    'failure',
    'timed_out',
    'cancelled',
    'action_required',
    'stale',
    'startup_failure',
  ];
  const r = evaluateCi({
    statuses: [],
    checkRuns: [
      ...failing.map((conclusion) => ({ name: conclusion, status: 'completed', conclusion })),
      { name: 'missing-conclusion', status: 'completed', conclusion: null },
      { name: 'neutral', status: 'completed', conclusion: 'neutral' },
      { name: 'skipped', status: 'completed', conclusion: 'skipped' },
    ],
  });
  assert.deepEqual(r.failed.map((item) => item.conclusion), [...failing, 'unknown']);
});

test('ignores old Codex Guard check runs by external id', () => {
  const r = evaluateCi({
    statuses: [],
    checkRuns: [{
      name: 'Codex Guard',
      status: 'completed',
      conclusion: 'failure',
      external_id: 'codex-guard-42',
    }],
  });
  assert.equal(r.failed.length, 0);
});

test('ignores this Action check by name to avoid a rerun feedback loop', () => {
  const r = evaluateCi({
    statuses: [],
    checkRuns: [{ name: 'codex guard', status: 'completed', conclusion: 'failure' }],
  });
  assert.equal(r.failed.length, 0);
});

test('one unavailable CI source is incomplete; both unavailable sources fail closed', () => {
  const one = evaluateCi({
    statuses: [],
    checkRuns: [{ name: 'build', status: 'completed', conclusion: 'success' }],
    errors: [{ source: 'commit statuses', kind: 'api', status: 403, message: 'commit statuses API unavailable' }],
  });
  assert.equal(one.failed.length, 0);
  assert.equal(one.complete, false);
  assert.match(one.report, /visibility incomplete/);

  const both = evaluateCi({
    statuses: [],
    checkRuns: [],
    errors: [
      { source: 'commit statuses', kind: 'api', message: 'commit statuses API unavailable' },
      { source: 'check runs', kind: 'api', message: 'check runs API unavailable' },
    ],
  });
  assert.deepEqual(both.failed, [{ name: 'CI visibility', conclusion: 'unavailable' }]);
  assert.equal(both.complete, false);
});

test('ignores named checks via ignore list', () => {
  const r = evaluateCi({
    statuses: [{ context: 'codecov', state: 'failure' }],
    checkRuns: [],
    ignoreNames: ['Codecov'],
  });
  assert.equal(r.failed.length, 0);
});
