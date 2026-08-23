'use strict';

/**
 * Describe how much of a PR GitHub made available for added-line content
 * checks. Binary and very large files may not have a textual `patch`; removed
 * and mode-only files do not contain added content and are not eligible.
 */
function evaluateContentCoverage(files, { enabled = true } = {}) {
  const source = Array.isArray(files) ? files : [];
  const apiLimitReached = Boolean(source.apiLimitReached);
  if (!enabled) {
    return {
      enabled: false,
      eligible: 0,
      scanned: 0,
      unscanned: [],
      apiLimitReached,
    };
  }

  const eligible = source.filter((file) =>
    file.status !== 'removed' &&
    (typeof file.additions !== 'number' || file.additions > 0)
  );
  const unscanned = eligible
    .filter((file) => typeof file.patch !== 'string' || file.patch.length === 0)
    .map((file) => ({
      file: file.filename || '<unknown file>',
      status: file.status || 'changed',
      reason: 'text patch unavailable',
    }));

  return {
    enabled: true,
    eligible: eligible.length,
    scanned: eligible.length - unscanned.length,
    unscanned,
    apiLimitReached,
  };
}

function isCoverageIncomplete(coverage) {
  return Boolean(
    coverage?.enabled &&
    (coverage.unscanned?.length || coverage.apiLimitReached)
  );
}

module.exports = { evaluateContentCoverage, isCoverageIncomplete };
