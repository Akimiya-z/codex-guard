'use strict';

const { allAddedLines } = require('./diff');
const { redactText } = require('./secrets');

/**
 * Scan added lines of every changed file for unfinished-work markers.
 *
 * @param {Array<{filename: string, patch?: string}>} files
 * @param {string[]} markers e.g. ['TODO', 'FIXME', 'XXX']
 * @returns {Array<{ file: string, line: number, marker: string, text: string }>}
 */
function findTodos(files, markers) {
  const findings = [];
  const columns = allAddedLines(files);

  for (const marker of markers.slice().sort((a, b) => b.length - a.length)) {
    const pattern = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${pattern}\\b`, 'i');
    for (const row of columns) {
      if (re.test(row.text)) {
        findings.push({
          file: row.file,
          line: row.line,
          marker,
          text: redactText(row.text.trim()),
        });
      }
    }
  }
  return findings;
}

module.exports = { findTodos };
