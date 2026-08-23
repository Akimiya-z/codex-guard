'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateContentCoverage,
  isCoverageIncomplete,
} = require('../src/checks/coverage');

test('reports complete coverage for eligible textual patches', () => {
  const coverage = evaluateContentCoverage([
    { filename: 'src/a.js', status: 'modified', additions: 2, patch: '@@\n+one\n+two' },
    { filename: 'src/b.js', status: 'added', additions: 1, patch: '@@\n+three' },
  ]);
  assert.deepEqual(coverage, {
    enabled: true,
    eligible: 2,
    scanned: 2,
    unscanned: [],
    apiLimitReached: false,
  });
  assert.equal(isCoverageIncomplete(coverage), false);
});

test('reports missing patches without counting deletions or mode-only files', () => {
  const coverage = evaluateContentCoverage([
    { filename: 'assets/large.bin', status: 'modified', additions: 20 },
    { filename: 'old.txt', status: 'removed', deletions: 5 },
    { filename: 'script.sh', status: 'modified', additions: 0, deletions: 0 },
  ]);
  assert.equal(coverage.eligible, 1);
  assert.equal(coverage.scanned, 0);
  assert.deepEqual(coverage.unscanned, [{
    file: 'assets/large.bin',
    status: 'modified',
    reason: 'text patch unavailable',
  }]);
  assert.equal(isCoverageIncomplete(coverage), true);
});

test('coverage is disabled when both content checks are disabled', () => {
  const coverage = evaluateContentCoverage(
    [{ filename: 'large.txt', status: 'modified', additions: 100 }],
    { enabled: false }
  );
  assert.equal(coverage.enabled, false);
  assert.equal(coverage.eligible, 0);
  assert.equal(isCoverageIncomplete(coverage), false);
});

test('the GitHub file-list cap makes coverage conservatively incomplete', () => {
  const files = [];
  Object.defineProperty(files, 'apiLimitReached', { value: true });
  const coverage = evaluateContentCoverage(files);
  assert.equal(coverage.apiLimitReached, true);
  assert.equal(isCoverageIncomplete(coverage), true);
});
