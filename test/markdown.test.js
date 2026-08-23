'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeInline, codeSpan } = require('../src/markdown');

test('normalizes control characters and bounds untrusted text', () => {
  assert.equal(normalizeInline('one\n\u0000two\tthree'), 'one two three');
  assert.equal(normalizeInline('abcdef', 4), 'abc…');
});

test('code spans contain Markdown, HTML, mentions and backticks as inert text', () => {
  const rendered = codeSpan('` <!-- @octocat **spoof**\n$(id)');
  assert.ok(rendered.startsWith('`` '));
  assert.ok(rendered.endsWith(' ``'));
  assert.ok(rendered.includes('<!-- @octocat **spoof** $(id)'));
  assert.equal(rendered.includes('\n'), false);
});
