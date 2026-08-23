'use strict';

/**
 * Evaluate CI status for a commit, given the results already fetched from the
 * GitHub API (combined status + check runs). Pure so it is unit-testable.
 *
 * @param {object} input
 * @param {Array} input.statuses combined status `.statuses` (commit statuses)
 * @param {Array} input.checkRuns check runs on the head SHA
 * @param {string[]} input.ignoreNames check names / contexts to skip
 * @returns {{ failed: Array<{name: string, conclusion: string}>, pending: Array<{name: string}>, errors: Array, complete: boolean, settled: boolean, report: string }}
 */
function evaluateCi({ statuses, checkRuns, errors = [], ignoreNames = [] }) {
  const ignore = new Set(['codex guard', ...ignoreNames.map((n) => n.toLowerCase())]);
  const failed = [];
  const pending = [];
  const passingConclusions = new Set(['success', 'neutral', 'skipped']);
  const pendingStatuses = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);

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
    // Ignore check runs previously created by this Action itself. Without this,
    // rerunning the same SHA could inherit an old Codex Guard failure forever.
    if (/^codex-guard-\d+$/.test(String(c.external_id || ''))) continue;

    const conclusion = String(c.conclusion || '').toLowerCase();
    const status = String(c.status || '').toLowerCase();
    if (conclusion && !passingConclusions.has(conclusion)) {
      failed.push({ name: c.name, conclusion });
    } else if (!conclusion && pendingStatuses.has(status)) {
      pending.push({ name: c.name });
    } else if (!conclusion && status === 'completed') {
      failed.push({ name: c.name, conclusion: 'unknown' });
    }
  }

  const apiFailures = errors.filter((error) => error.kind === 'api');
  if (new Set(apiFailures.map((error) => error.source)).size >= 2) {
    failed.push({ name: 'CI visibility', conclusion: 'unavailable' });
  }

  const errorSummary = errors
    .map((error) => `${error.message}${error.status ? ` (${error.status})` : ''}`)
    .join(', ');
  let report = failed.length
    ? `CI failing on head commit: ${failed
        .map((f) => `${f.name} (${f.conclusion})`)
        .join(', ')}`
    : errors.length
      ? `CI visibility incomplete: ${errorSummary}`
      : pending.length
      ? `CI pending (waiting on: ${pending.map((p) => p.name).join(', ')})`
      : 'All CI checks green.';
  if (failed.length && errors.length) report += `; visibility incomplete: ${errorSummary}`;

  return {
    failed,
    pending,
    errors,
    complete: errors.length === 0,
    settled: pending.length === 0,
    report,
  };
}

module.exports = { evaluateCi };
