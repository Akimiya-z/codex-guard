'use strict';

/**
 * Thin wrappers around the GitHub REST API used by codex-guard. Kept separate
 * from the check logic so the orchestration in main.js has few moving parts.
 */

/** @param {object} octokit @param {object} ctx {owner, repo, prNumber, headSha} */
async function getPrFiles(octokit, ctx) {
  const result = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.prNumber,
      per_page: 100,
      page,
    });
    result.push(...data);
    if (data.length < 100) break;
    page += 1;
  }
  return result;
}

/** @returns {Promise<Array<{sha, message, author}>>} */
async function getPrCommits(octokit, ctx) {
  const { data } = await octokit.rest.pulls.listCommits({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.prNumber,
    per_page: 100,
  });
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.author ? c.author.login : c.commit.author?.name || 'unknown',
  }));
}

/** @returns {Promise<{statuses: Array, checkRuns: Array}>} */
async function getCiResults(octokit, ctx) {
  const statusPromise = octokit.rest.repos
    .getCombinedStatusForRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.headSha,
    })
    .then((r) => r.data.statuses || [])
    .catch(() => []);

  const runsPromise = octokit.rest.checks
    .listForRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.headSha,
      per_page: 100,
    })
    .then((r) => r.data.check_runs || [])
    .catch(() => []);

  const [statuses, checkRuns] = await Promise.all([statusPromise, runsPromise]);
  return { statuses, checkRuns };
}

/** Create a completed check run, with inline annotations when there are any. */
async function createCheckRun(octokit, ctx, { name, conclusion, summaryText, annotations, externalId }) {
  const body = {
    owner: ctx.owner,
    repo: ctx.repo,
    name,
    head_sha: ctx.headSha,
    status: 'completed',
    conclusion,
    output: {
      title:
        conclusion === 'success' ? 'Codex Guard passed' : 'Codex Guard failed',
      summary: summaryText,
    },
  };
  if (annotations && annotations.length) {
    body.output.annotations = annotations.slice(0, 50).map((a) => ({
      path: a.file,
      start_line: a.line,
      end_line: a.line,
      annotation_level: a.level || 'warning',
      message: (a.message || '').slice(0, 254),
      title: a.title,
    }));
  }
  if (externalId) body.external_id = externalId;

  try {
    await octokit.rest.checks.create(body);
  } catch {
    // Check creation can fail on forks without write access to checks — the
    // workflow output + comment still carry the result, so don't hard-fail here.
  }
}

/**
 * Post or update the Codex Guard report comment on a PR.
 *
 * `mode`:
 *  - 'replace' (default): update the latest existing report comment in place,
 *    creating one only if none exists — one living report per PR, no spam on
 *    every push.
 *  - 'append': always create a new comment.
 *  - 'none': do nothing.
 *
 * @returns {'created'|'updated'|false}
 */
async function upsertComment(octokit, ctx, body, header, mode = 'replace') {
  if (mode === 'none') return false;
  try {
    const { data } = await octokit.rest.issues.listComments({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.prNumber,
      per_page: 100,
    });
    const existing = data
      .filter((c) => c.body && c.body.includes(header))
      .sort((a, b) => a.id - b.id)
      .pop();

    if (existing && mode === 'replace') {
      await octokit.rest.issues.updateComment({
        owner: ctx.owner,
        repo: ctx.repo,
        comment_id: existing.id,
        body,
      });
      return 'updated';
    }

    await octokit.rest.issues.createComment({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.prNumber,
      body,
    });
    return 'created';
  } catch {
    return false;
  }
}

/** Submit a formal REQUEST_CHANGES review when findings are blocking (opt-in). */
async function requestChanges(octokit, ctx, body) {
  try {
    await octokit.rest.pulls.createReview({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.prNumber,
      event: 'REQUEST_CHANGES',
      body,
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getPrFiles,
  getPrCommits,
  getCiResults,
  createCheckRun,
  upsertComment,
  requestChanges,
};
