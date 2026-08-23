'use strict';

/** Normalize attacker-controlled text before placing it in GitHub Markdown. */
function normalizeInline(value, maxLength = 500) {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 1)) + '…';
}

/**
 * Render untrusted text as an inline code span. The delimiter is always longer
 * than any backtick run in the value, so Markdown/HTML/mentions remain inert.
 */
function codeSpan(value, maxLength = 500) {
  const text = normalizeInline(value, maxLength) || '<empty>';
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${text} ${fence}`;
}

module.exports = { normalizeInline, codeSpan };
