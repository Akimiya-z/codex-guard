'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_UNTRACKED_BYTES = 8 * 1024 * 1024;

function addedFilePatch(text) {
  if (!text) return '';
  const normalized = String(text).replace(/\r\n?/g, '\n');
  const lines = normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : normalized.split('\n');
  if (!lines.length) return '';
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}\n`;
}

function safeRepoPath(root, filename) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, filename);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
    ? resolved
    : null;
}

/**
 * Read Git-ignored-aware untracked files as all-added patches.
 *
 * `git diff` does not include untracked files, but those are exactly where a
 * newly-created secret or unfinished-work marker often lives before the first
 * commit. NUL output keeps unusual filenames (spaces/newlines) unambiguous.
 */
function collectUntrackedFiles({ execGit, root, readBuffer, statFile } = {}) {
  const read = readBuffer || ((filename) => fs.readFileSync(filename));
  const stat = statFile || ((filename) => fs.lstatSync(filename));
  const output = execGit(['ls-files', '--others', '--exclude-standard', '-z']);
  const names = String(output).split('\0').filter(Boolean);
  const files = [];
  const skipped = [];

  for (const filename of names) {
    const absolute = safeRepoPath(root, filename);
    if (!absolute) {
      skipped.push({ file: filename, reason: 'path escapes repository root' });
      continue;
    }

    let info;
    try {
      info = stat(absolute);
    } catch {
      skipped.push({ file: filename, reason: 'file became unavailable while scanning' });
      continue;
    }
    if (!info.isFile()) {
      skipped.push({ file: filename, reason: 'not a regular file' });
      continue;
    }
    if (info.size > MAX_UNTRACKED_BYTES) {
      skipped.push({
        file: filename,
        reason: `larger than ${MAX_UNTRACKED_BYTES / 1024 / 1024} MiB local safety limit`,
      });
      continue;
    }

    let buffer;
    try {
      buffer = read(absolute);
    } catch {
      skipped.push({ file: filename, reason: 'file could not be read' });
      continue;
    }
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (bytes.includes(0)) {
      skipped.push({ file: filename, reason: 'binary file' });
      continue;
    }
    files.push({ filename, patch: addedFilePatch(bytes.toString('utf8')), untracked: true });
  }

  return { files, skipped };
}

module.exports = {
  MAX_UNTRACKED_BYTES,
  addedFilePatch,
  safeRepoPath,
  collectUntrackedFiles,
};
