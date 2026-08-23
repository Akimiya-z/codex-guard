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

test('does not treat marker-shaped identifiers as unfinished work', () => {
  const marker = ['TO', 'DO'].join('');
  const patch = [
    '@@ -0,0 +1,4 @@',
    '+todo-blocking: false',
    '+const todo_item = true;',
    `+const my${marker} = true;`,
    `+// ${marker}: real unfinished work`,
  ].join('\n');
  const findings = findTodos([{ filename: 'config.js', patch }], [marker]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 4);
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

test('bounds and normalizes source context exported in findings', () => {
  const marker = ['TO', 'DO'].join('');
  const patch = `@@ -0,0 +1,1 @@\n+// ${marker}: \u001b${'x'.repeat(2000)}`;
  const [finding] = findTodos([{ filename: 'large.js', patch }], [marker]);
  assert.ok(finding.text.length <= 500);
  assert.doesNotMatch(finding.text, /\u001b/);
});
