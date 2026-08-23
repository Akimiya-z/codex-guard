'use strict';

/**
 * Thin wrappers around the GitHub REST API used by codex-guard. Kept separate
 * from the check logic so the orchestration in main.js has few moving parts.
 */

/** @param {object} octokit @param {object} ctx {owner, repo, prNumber, headSha} */
async function getPrFiles(octokit, ctx) {
  const maxFiles = 3000; // GitHub's documented cap for this endpoint.
  const result = [];
  let page = 1;
  for (;;) {
    const perPage = Math.min(100, maxFiles - result.length);
    const { data } = await octokit.rest.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.prNumber,
      per_page: perPage,
      page,
    });
    result.push(...data);
    if (data.length < perPage || result.length >= maxFiles) break;
    page += 1;
  }
  Object.defineProperty(result, 'apiLimitReached', {
    value: result.length >= maxFiles,
    enumerable: false,
  });
  return result;
}

/** @returns {Promise<Array<{sha, message, author}>>} */
async function getPrCommits(octokit, ctx) {
  const result = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.rest.pulls.listCommits({
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
  return result.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.author ? c.author.login : c.commit.author?.name || 'unknown',
  }));
}

const CI_PAGE_SIZE = 100;
const CI_MAX_PAGES = 30;

async function fetchCiPages(fetchPage, pickItems, source) {
  const items = [];
  for (let page = 1; page <= CI_MAX_PAGES; page++) {
    const response = await fetchPage(page);
    const batch = pickItems(response) || [];
    items.push(...batch);
    if (batch.length < CI_PAGE_SIZE) return { items, error: null };
  }
  return {
    items,
    error: { source, kind: 'cap', message: `${source} reached the 3,000-result safety cap` },
  };
}

function apiFailure(source, err) {
  return {
    items: [],
    error: {
      source,
      kind: 'api',
      status: Number.isInteger(err?.status) ? err.status : null,
      message: `${source} API unavailable`,
    },
  };
}

/** @returns {Promise<{statuses: Array, checkRuns: Array, errors: Array}>} */
async function getCiResults(octokit, ctx) {
  const statusesPromise = fetchCiPages(
    (page) => octokit.rest.repos.getCombinedStatusForRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.headSha,
      per_page: CI_PAGE_SIZE,
      page,
    }),
    (response) => response.data.statuses,
    'commit statuses'
  ).catch((err) => apiFailure('commit statuses', err));

  const checkRunsPromise = fetchCiPages(
    (page) => octokit.rest.checks.listForRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.headSha,
      per_page: CI_PAGE_SIZE,
      page,
      filter: 'latest',
    }),
    (response) => response.data.check_runs,
    'check runs'
  ).catch((err) => apiFailure('check runs', err));

  const [statusesResult, checkRunsResult] = await Promise.all([
    statusesPromise,
    checkRunsPromise,
  ]);
  return {
    statuses: statusesResult.items,
    checkRuns: checkRunsResult.items,
    errors: [statusesResult.error, checkRunsResult.error].filter(Boolean),
  };
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
        conclusion === 'success'
          ? 'Codex Guard passed'
          : conclusion === 'neutral'
            ? 'Codex Guard found non-blocking issues'
            : 'Codex Guard failed',
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

  let existing = null;
  try {
    const comments = [];
    for (let page = 1; page <= 30; page++) {
      const { data } = await octokit.rest.issues.listComments({
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: ctx.prNumber,
        per_page: 100,
        page,
      });
      comments.push(...data);
      if (data.length < 100) break;
    }
    existing = comments
      .filter((c) => c.body && c.body.includes(header))
      .sort((a, b) => a.id - b.id)
      .pop();
  } catch {
    // Listing comments is best-effort. Creating a new report below is safer
    // than suppressing the report entirely.
  }

  if (existing && mode === 'replace') {
    try {
      await octokit.rest.issues.updateComment({
        owner: ctx.owner,
        repo: ctx.repo,
        comment_id: existing.id,
        body,
      });
      return 'updated';
    } catch {
      // A user can copy the report header into a comment the Action cannot
      // edit. Fall through and create the real report instead of losing it.
    }
  }

  try {
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
