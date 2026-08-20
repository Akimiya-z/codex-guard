'use strict';

/**
 * Evaluate CI status for a commit, given the results already fetched from the
 * GitHub API (combined status + check runs). Pure so it is unit-testable.
 *
 * @param {object} input
 * @param {Array} input.statuses combined status `.statuses` (commit statuses)
 * @param {Array} input.checkRuns check runs on the head SHA
 * @param {string[]} input.ignoreNames check names / contexts to skip
 * @returns {{ failed: Array<{name: string, conclusion: string}>, pending: Array<{name: string}>, report: string }}
 */
function evaluateCi({ statuses, checkRuns, ignoreNames = [] }) {
  const ignore = new Set(ignoreNames.map((n) => n.toLowerCase()));
  const failed = [];
  const pending = [];

  for (const s of statuses || []) {
    if (ignore.has(s.context.toLowerCase())) continue;
    if (s.state === 'failure' || s.state === 'error') {
      failed.push({ name: s.context, conclusion: s.state });
    } else if (s.state === 'pending') {
      pending.push({ name: s.context });
    }
  }

  for (const c of checkRuns || []) {
    if (ignore.has(c.name.toLowerCase())) continue;
    if (c.conclusion === 'failure' || c.conclusion === 'timed_out') {
      failed.push({ name: c.name, conclusion: c.conclusion });
    } else if (
      !c.conclusion &&
      (c.status === 'in_progress' || c.status === 'queued')
    ) {
      pending.push({ name: c.name });
    }
  }

  const report = failed.length
    ? `CI failing on head commit: ${failed
        .map((f) => `${f.name} (${f.conclusion})`)
        .join(', ')}`
    : pending.length
      ? `CI pending (waiting on: ${pending.map((p) => p.name).join(', ')})`
      : 'All CI checks green.';

  return { failed, pending, report };
}

module.exports = { evaluateCi };
