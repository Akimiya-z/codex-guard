'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

test('every static Action output written by main is declared in action.yml', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const manifest = yaml.load(fs.readFileSync(path.join(root, 'action.yml'), 'utf8'));
  const written = [...source.matchAll(/setOutput\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  const declared = new Set(Object.keys(manifest.outputs || {}));

  for (const name of new Set(written)) {
    assert.ok(declared.has(name), `Action output "${name}" is not declared in action.yml`);
  }
});
