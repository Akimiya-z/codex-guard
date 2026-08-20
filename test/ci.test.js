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

test('treats only in-progress/queued runs as pending', () => {
  const r = evaluateCi({
    statuses: [],
    checkRuns: [
      { name: 'lint', status: 'in_progress' },
      { name: 'done', conclusion: 'success', status: 'completed' },
    ],
  });
  assert.equal(r.failed.length, 0);
  assert.deepEqual(r.pending.map((p) => p.name), ['lint']);
});

test('ignores named checks via ignore list', () => {
  const r = evaluateCi({
    statuses: [{ context: 'codecov', state: 'failure' }],
    checkRuns: [],
    ignoreNames: ['Codecov'],
  });
  assert.equal(r.failed.length, 0);
});
