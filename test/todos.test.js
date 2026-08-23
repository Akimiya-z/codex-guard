'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { findTodos } = require('../src/checks/todos');
const { filesFromPatch, PATCH } = require('./helpers');

test('flags added TODO/FIXME markers with file and line', () => {
  const findings = findTodos(filesFromPatch(), ['TODO', 'FIXME', 'XXX']);

  const todo = findings.find((f) => f.marker === 'TODO');
  assert.ok(todo, 'should find a TODO');
  assert.equal(todo.file, 'src/auth.py');
  assert.equal(todo.line, 12);

  const fixme = findings.find((f) => f.marker === 'FIXME');
  assert.ok(fixme, 'should find a FIXME');
  assert.equal(fixme.line, 29);
});

test('does not flag markers on removed or context lines', () => {
  const patch = [
    '@@ -1,3 +1,3 @@',
    '-// FIXME: old code being deleted',
    ' // TODO: pre-existing context line',
    '+// TODO: brand new work',
  ].join('\n');

  const findings = findTodos([{ filename: 'x.js', patch }], ['TODO', 'FIXME']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].text, '// TODO: brand new work');
});

test('honors custom marker lists', () => {
  const findings = findTodos(filesFromPatch(), ['HACK']);
  assert.equal(findings.length, 0);
  const withWip = findTodos(filesFromPatch(), ['WIP']);
  assert.equal(withWip.length, 0);
});

test('works on the raw combined fixture patch', () => {
  const findings = findTodos(
    [{ filename: 'src/auth.py', patch: PATCH }],
    ['TODO', 'FIXME', 'XXX', 'WIP']
  );
  assert.equal(findings.length, 2);
});

test('does not echo a secret from a TODO line', () => {
  const key = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const patch = [
    '@@ -1,1 +1,2 @@',
    `+const key = "${key}"; // TODO: move to secret storage`,
  ].join('\n');
  const [finding] = findTodos([{ filename: 'config.js', patch }], ['TODO']);
  assert.ok(finding.text.includes('AKIA...MPLE'));
  assert.ok(!finding.text.includes(key));
});
