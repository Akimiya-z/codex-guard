'use strict';

/**
 * Parse a unified-diff `patch` string and return the lines that were ADDED,
 * with their target line numbers in the new file. Existing/removed lines and
 * hunk headers are skipped, so checks only flag code the PR actually introduces.
 *
 * @param {string} patch
 * @returns {Array<{ text: string, line: number }>}
 */
function addedLines(patch) {
  if (!patch) return [];
  const out = [];
  const lines = patch.split('\n');
  let newLine = 0;

  for (const line of lines) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      out.push({ text: line.slice(1), line: newLine });
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      // Context line (starts with a space) — advances both positions.
      newLine += 1;
    }
  }
  return out;
}

/**
 * Get an array of added lines for a list of files as returned by
 * `pulls.listFiles` (each item has `filename` and optional `patch`).
 */
function allAddedLines(files) {
  const rows = [];
  for (const file of files) {
    const patch = file.patch || '';
    for (const row of addedLines(patch)) {
      rows.push({ file: file.filename, text: row.text, line: row.line });
    }
  }
  return rows;
}

module.exports = { addedLines, allAddedLines };
