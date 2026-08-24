'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('npm syntax check is implemented by a portable Node script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.check, 'node scripts/check.js');
  assert.ok(pkg.files.includes('scripts'));
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['scripts/check.js'], {
      cwd: root,
      stdio: 'pipe',
    });
  });
});
