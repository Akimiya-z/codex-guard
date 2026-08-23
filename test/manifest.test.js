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

test('sweep report output reaches the shell only through an environment variable', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '.github/workflows/sweep.yml'),
    'utf8'
  );
  assert.match(source, /SWEEP_REPORT:\s*\$\{\{ steps\.guard\.outputs\.sweep-report \}\}/);
  assert.match(source, /printf '%s\\n' "\$SWEEP_REPORT"/);
  assert.doesNotMatch(
    source,
    /^\s*(?:echo|printf).*\$\{\{ steps\.guard\.outputs\.sweep-report \}\}/m
  );
});

test('repository workflows pin third-party Actions to full commit SHAs', () => {
  const workflowsDir = path.join(__dirname, '..', '.github/workflows');
  for (const name of fs.readdirSync(workflowsDir).filter((file) => file.endsWith('.yml'))) {
    const source = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
    for (const match of source.matchAll(/uses:\s+(actions\/[^@\s]+)@([^\s#]+)/g)) {
      assert.match(
        match[2],
        /^[0-9a-f]{40}$/,
        `${name}: ${match[1]} must be pinned to a full commit SHA`
      );
    }
  }
});

test('action-validator is exact-pinned and executed from the lockfile', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.devDependencies['@action-validator/cli'], /^\d+\.\d+\.\d+$/);
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /npm exec --offline -- action-validator/);
  assert.doesNotMatch(ci, /npx .*action-validator/);
});
