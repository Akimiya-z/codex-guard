'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { addedLines, allAddedLines } = require('../src/checks/diff');

const PATCH = [
  '@@ -10,7 +10,9 @@ def login():',
  '     client = connect()',
  '-    return client.authenticate(u)',
  '+    # TODO: wire up',
  '+    return client.authenticate_oidc(u)',
  '+',
  '+    # context-like added line',
  '     return cred',
].join('\n');

test('addedLines parses hunks and tracks line numbers', () => {
  const rows = addedLines(PATCH);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { text: '    # TODO: wire up', line: 11 });
  assert.deepEqual(rows[2], { text: '', line: 13 });
  assert.deepEqual(rows[3], { text: '    # context-like added line', line: 14 });
});

test('addedLines handles multiple hunks with offset ranges', () => {
  const patch = [
    '@@ -5,0 +6,2 @@',
    '+a',
    '+b',
    '@@ -30,0 +40,1 @@',
    '+c',
  ].join('\n');
  const rows = addedLines(patch);
  assert.deepEqual(
    rows.map((r) => r.text),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    rows.map((r) => r.line),
    [6, 7, 40]
  );
});

test('addedLines ignores empty patches and added-file headers', () => {
  assert.deepEqual(addedLines(''), []);
  const rows = addedLines('+++ b/new.js\n+let x = 1;\n');
  assert.deepEqual(rows, [{ text: 'let x = 1;', line: 1 }]);
});

test('allAddedLines attaches filenames', () => {
  const rows = allAddedLines([
    { filename: 'a.js', patch: '+one' },
    { filename: 'no-diff.js' },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.file, r.text]),
    [['a.js', 'one']]
  );
});
