#!/usr/bin/env node
'use strict';

// Keep `npm run check` portable: package.json scripts run through cmd.exe on
// Windows, so a POSIX shell loop would make the documented contributor check
// unusable there.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function collectJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScript(filename);
      return entry.isFile() && entry.name.endsWith('.js') ? [filename] : [];
    });
}

const files = ['src', 'test', 'scripts']
  .flatMap((name) => collectJavaScript(path.join(root, name)))
  .sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
