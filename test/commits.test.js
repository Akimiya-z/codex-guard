'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { findBadCommits, DEFAULTS } = require('../src/checks/commits');

const good = [
  { sha: '1', message: 'feat(auth): add oidc login' },
  { sha: '2', message: 'fix: typo' },
  { sha: '3', message: 'chore: bump deps' },
  { sha: '4', message: 'Merge branch main into feat/x' },
  { sha: '5', message: 'Initial commit' },
];
const bad = [
  { sha: '6', message: 'fix stuff', author: 'codex' },
  { sha: '7', message: '', author: 'codex' },
  { sha: '8', message: 'WIP', author: 'codex' },
];

test('accepts conventional and merge/initial subjects', () => {
  assert.equal(findBadCommits(good, DEFAULTS).length, 0);
});

test('flags non-conforming and empty subjects', () => {
  const findings = findBadCommits(bad, DEFAULTS);
  assert.equal(findings.length, 3);
  assert.deepEqual(
    findings.map((f) => f.sha),
    ['6', '7', '8']
  );
});

test('multi-line messages use the subject line only', () => {
  const one = { sha: '9', message: 'feat: good subject\nexplaining body' };
  assert.equal(findBadCommits([one], DEFAULTS).length, 0);
});

test('custom pattern changes what passes', () => {
  const findings = findBadCommits(bad, { pattern: '^.*$' });
  assert.deepEqual(
    findings.map((f) => f.sha),
    ['7'] // only the empty subject still fails
  );
});
