'use strict';

const DEFAULTS = {
  pattern:
    '(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\([a-z0-9-]+\\))?!?: .+|Merge .*|Revert .*|Initial commit|Update .+|Bump .+',
};

/**
 * Validate the subjects of a PR's commits against a conventional-commit style
 * pattern. AI agents frequently pepper PRs with "Update file", "fix typo",
 * "WIP" commits — this surfaces sloppy commit hygiene before merge.
 *
 * @param {Array<{sha: string, message: string, author?: string}>} commits
 * @param {object} [config]
 * @param {string} [config.pattern] regex a subject must match
 * @returns {Array<{ sha: string, subject: string, author: string, message: string }>}
 */
function findBadCommits(commits, config = {}) {
  const pattern = config.pattern || DEFAULTS.pattern;
  const re = new RegExp(pattern);
  const findings = [];

  for (const commit of commits) {
    const firstLine = (commit.message || '').split('\n')[0].trim();
    if (!firstLine) {
      findings.push({
        sha: commit.sha,
        subject: '(empty commit subject)',
        author: commit.author || 'unknown',
        message: commit.message,
      });
      continue;
    }
    if (!re.test(firstLine)) {
      findings.push({
        sha: commit.sha,
        subject: firstLine,
        author: commit.author || 'unknown',
        message: commit.message,
      });
    }
  }
  return findings;
}

module.exports = { findBadCommits, DEFAULTS };
