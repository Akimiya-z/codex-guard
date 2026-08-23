'use strict';

const HEADER = '## 🤖 Codex Guard';

/**
 * Build the PR comment / step-summary markdown.
 *
 * @param {object} result
 * @param {boolean} result.passed
 * @param {boolean} [result.observing] findings are reported but non-blocking
 * @param {object} result.groups
 *   { todos: [], secrets: [], commits: [], ci: { ok: boolean, failed: [], pending: [], report: string } }
 * @param {string} result.detected signal that matched, or ''
 */
function buildMarkdown(result) {
  const { groups } = result;
  const coverage = groups.coverage || {
    enabled: false,
    eligible: 0,
    scanned: 0,
    unscanned: [],
    apiLimitReached: false,
  };
  const incompleteCoverage = Boolean(
    coverage.enabled && (coverage.unscanned.length || coverage.apiLimitReached)
  );
  const parts = [HEADER, ''];

  parts.push(
    result.passed
      ? incompleteCoverage
        ? '⚠️ **Blocking checks passed, but content scan coverage is incomplete.**'
        : '✅ **All checks passed.**'
      : result.observing
        ? '🔎 **Findings detected — observe mode is enabled, so this run remains non-blocking.**'
      : '❌ **Checks failed — review the findings before merging.**'
  );

  const badge = (n) => (n ? `⚠️ ${n}` : '✅');
  const ci = groups.ci.ok
    ? '✅'
    : groups.ci.failed.length
      ? `❌ ${groups.ci.failed.length}`
      : '⏳';

  parts.push('', '| Check | Result |', '| --- | --- |');
  parts.push(`| TODO / FIXME scan | ${badge(groups.todos.length)} |`);
  parts.push(`| Secret scan | ${badge(groups.secrets.length)} |`);
  parts.push(`| Commit hygiene | ${badge(groups.commits.length)} |`);
  parts.push(`| CI status | ${ci} |`);
  if (coverage.enabled) {
    parts.push(
      `| Content scan coverage | ${incompleteCoverage ? '⚠️' : '✅'} ${coverage.scanned}/${coverage.eligible} files |`
    );
  }

  const sections = [];

  if (groups.todos.length) {
    sections.push('**Unfinished work**');
    for (const f of groups.todos.slice(0, 10)) {
      sections.push(`- \`${f.file}:${f.line}\` — \`${f.marker}\`: ${f.text}`);
    }
    if (groups.todos.length > 10) {
      sections.push(`- …and ${groups.todos.length - 10} more`);
    }
  }

  if (groups.secrets.length) {
    sections.push('**Potential leaked secrets**');
    for (const f of groups.secrets.slice(0, 10)) {
      sections.push(
        `- \`${f.file}:${f.line}\` — ${f.type} \`${f.secret}\``
      );
    }
    if (groups.secrets.length > 10) {
      sections.push(`- …and ${groups.secrets.length - 10} more`);
    }
  }

  if (groups.commits.length) {
    sections.push('**Commit hygiene**');
    for (const f of groups.commits.slice(0, 10)) {
      sections.push(`- \`${f.sha.slice(0, 7)}\` — _${f.subject}_ (by ${f.author})`);
    }
    if (groups.commits.length > 10) {
      sections.push(`- …and ${groups.commits.length - 10} more`);
    }
  }

  if (!groups.ci.ok && groups.ci.report) {
    sections.push(`**CI**\n- ${groups.ci.report}`);
  }

  if (incompleteCoverage) {
    sections.push('**Content scan coverage**');
    if (coverage.unscanned.length) {
      sections.push(
        `- GitHub did not provide a text patch for ${coverage.unscanned.length} eligible ` +
        `file${coverage.unscanned.length === 1 ? '' : 's'}; TODO and secret checks could not inspect them.`
      );
      for (const item of coverage.unscanned.slice(0, 10)) {
        const safePath = String(item.file).replace(/[\r\n]/g, ' ').replace(/`/g, 'ˋ');
        sections.push(`- \`${safePath}\` — ${item.reason}`);
      }
      if (coverage.unscanned.length > 10) {
        sections.push(`- …and ${coverage.unscanned.length - 10} more`);
      }
    }
    if (coverage.apiLimitReached) {
      sections.push(
        '- GitHub returned its maximum 3,000-file PR listing; additional changed files may be absent.'
      );
    }
  }

  if (sections.length) parts.push('', ...sections);
  if (result.detected) {
    parts.push('', `> Detected as an AI-generated PR (${result.detected}).`);
  }
  parts.push('', '_Run by `codex-guard`. Learn more in the repo README._');
  return parts.join('\n');
}

/**
 * Convert findings into GitHub check-run annotations.
 *
 * Line-level findings (todos, secrets) get inline annotations. Commit-hygiene
 * issues are repo-global and have no sensible file/line anchor, so they stay in
 * the comment + check summary instead of producing a bogus file path.
 */
function toAnnotations(groups) {
  const annotations = [];
  for (const f of groups.todos) {
    annotations.push({
      file: f.file,
      line: f.line,
      level: 'warning',
      title: `TODO leftover: ${f.marker}`,
      message: `Added line contains \`${f.marker}\`. Remove it or file a tracked issue before merging.`,
    });
  }
  for (const f of groups.secrets) {
    annotations.push({
      file: f.file,
      line: f.line,
      level: 'failure',
      title: `Potential leaked secret: ${f.type}`,
      message: `Possible ${f.type} found (\`${f.secret}\`). Rotate it and keep credentials in secret storage.`,
    });
  }
  return annotations;
}

module.exports = { HEADER, buildMarkdown, toAnnotations };
