'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMarkdown, toAnnotations, HEADER } = require('../src/reporter');

const groups = {
  todos: [{ file: 'a.py', line: 11, marker: 'TODO', text: '# TODO: x' }],
  secrets: [{ file: 'a.py', line: 13, type: 'AWS Access Key ID', secret: 'AKIA...MPLE' }],
  commits: [{ sha: 'a'.repeat(40), subject: 'fix stuff', author: 'codex' }],
  ci: { ok: false, failed: [{ name: 'ci/test', conclusion: 'failure' }], pending: [], report: 'CI failing on head commit: ci/test (failure)' },
};

test('failed markdown includes findings and detection note', () => {
  const md = buildMarkdown({ passed: false, groups, detected: 'label "codex-generated"' });
  assert.ok(md.includes(HEADER));
  assert.ok(md.includes('Checks failed'));
  assert.ok(md.includes('a.py:11'));
  assert.ok(md.includes('AKIA...MPLE'));
  assert.ok(md.includes('codex'));
  assert.ok(md.includes('codex-generated'));
});

test('passing markdown is clean', () => {
  const happy = {
    ...groups,
    todos: [],
    secrets: [],
    commits: [],
    ci: { ok: true, failed: [], pending: [], report: '' },
  };
  const md = buildMarkdown({ passed: true, groups: happy, detected: '' });
  assert.ok(md.includes('All checks passed'));
  assert.ok(!md.includes('❌'));
});

test('annotations map to GitHub levels', () => {
  const ann = toAnnotations(groups);
  // Line-level findings only — commit hygiene has no file/line anchor.
  assert.equal(ann.length, 2);
  assert.equal(ann[0].level, 'warning');
  assert.equal(ann[1].level, 'failure');
  assert.ok(ann.every((a) => a.file && a.line));
});
