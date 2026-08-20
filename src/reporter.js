'use strict';

const HEADER = '## 🤖 Codex Guard';

/**
 * Build the PR comment / step-summary markdown.
 *
 * @param {object} result
 * @param {boolean} result.passed
 * @param {object} result.groups
 *   { todos: [], secrets: [], commits: [], ci: { ok: boolean, failed: [], pending: [], report: string } }
 * @param {string} result.detected signal that matched, or ''
 */
function buildMarkdown(result) {
  const { groups } = result;
  const parts = [HEADER, ''];

  parts.push(
    result.passed
      ? '✅ **All checks passed.**'
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
