'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_UNTRACKED_BYTES,
  addedFilePatch,
  safeRepoPath,
  collectUntrackedFiles,
} = require('../src/local-files');

test('addedFilePatch turns every line into an added hunk', () => {
  assert.equal(addedFilePatch('one\r\ntwo\n'), '@@ -0,0 +1,2 @@\n+one\n+two\n');
  assert.equal(addedFilePatch(''), '');
});

test('safeRepoPath rejects traversal and absolute paths outside the repo', () => {
  const root = path.join(os.tmpdir(), 'repo');
  assert.equal(safeRepoPath(root, '../secret'), null);
  assert.equal(safeRepoPath(root, path.join(root, 'ok.txt')), path.join(root, 'ok.txt'));
});

test('collectUntrackedFiles handles unusual names and reports binary or large files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-files-'));
  // Windows filesystems reject control characters in names. Keep the newline
  // coverage where supported, while exercising spaces and Unicode everywhere.
  const textName = process.platform === 'win32'
    ? 'space and unicode-✓.js'
    : 'space and\nnewline.js';
  const binaryName = 'image.bin';
  const largeName = 'large.txt';
  const marker = ['TO', 'DO'].join('');
  fs.writeFileSync(path.join(root, textName), `// ${marker}: scan me\n`);
  fs.writeFileSync(path.join(root, binaryName), Buffer.from([1, 0, 2]));
  fs.writeFileSync(path.join(root, largeName), 'x');
  try {
    const found = collectUntrackedFiles({
      root,
      execGit: (args) => {
        assert.deepEqual(args, ['ls-files', '--others', '--exclude-standard', '-z']);
        return `${textName}\0${binaryName}\0${largeName}\0`;
      },
      statFile: (filename) => filename.endsWith(largeName)
        ? { isFile: () => true, size: MAX_UNTRACKED_BYTES + 1 }
        : fs.lstatSync(filename),
    });
    assert.equal(found.files.length, 1);
    assert.equal(found.files[0].filename, textName);
    assert.ok(found.files[0].patch.includes(`${marker}: scan me`));
    assert.deepEqual(found.skipped.map((item) => item.reason), [
      'binary file',
      'larger than 8 MiB local safety limit',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
