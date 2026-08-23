'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPrFiles,
  getPrCommits,
  getCiResults,
  upsertComment,
  requestChanges,
} = require('../src/github');

const HEADER = '## 🤖 Codex Guard';
const ctx = { owner: 'o', repo: 'r', prNumber: 3 };

function commentClient({ existing = [], pages, updateError } = {}) {
  const calls = { create: [], update: [] };
  const client = {
    rest: {
      issues: {
        async listComments({ page }) {
          return { data: pages ? (pages[page - 1] || []) : existing };
        },
        async createComment({ body }) {
          calls.create.push(body);
          return { data: {} };
        },
        async updateComment({ comment_id: id, body }) {
          calls.update.push({ id, body });
          if (updateError) throw updateError;
          return { data: {} };
        },
      },
    },
  };
  return { client, calls };
}

const OLD_BODY = `${HEADER}\n\n❌ Checks failed — v1.`;
const NEW_BODY = `${HEADER}\n\n❌ Checks failed — v2.`;

test('getPrCommits paginates beyond the first 100 commits', async () => {
  const pages = [];
  const makeCommit = (i) => ({
    sha: String(i).padStart(40, '0'),
    commit: { message: `feat: commit ${i}`, author: { name: 'agent' } },
    author: { login: 'agent' },
  });
  const client = {
    rest: {
      pulls: {
        async listCommits({ page }) {
          pages.push(page);
          return {
            data: page === 1
              ? Array.from({ length: 100 }, (_, i) => makeCommit(i))
              : [makeCommit(100)],
          };
        },
      },
    },
  };

  const commits = await getPrCommits(client, ctx);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(commits.length, 101);
  assert.equal(commits[100].message, 'feat: commit 100');
});

test('getPrFiles stops at GitHub\'s 3,000-file API cap and marks the result', async () => {
  const pages = [];
  const client = {
    rest: {
      pulls: {
        async listFiles({ page, per_page: perPage }) {
          pages.push({ page, perPage });
          return {
            data: Array.from({ length: perPage }, (_, i) => ({
              filename: `file-${page}-${i}.txt`,
              status: 'modified',
              additions: 1,
              patch: '@@\n+line',
            })),
          };
        },
      },
    },
  };

  const files = await getPrFiles(client, ctx);
  assert.equal(files.length, 3000);
  assert.equal(files.apiLimitReached, true);
  assert.equal(pages.length, 30);
  assert.deepEqual(pages.at(-1), { page: 30, perPage: 100 });
});

test('getCiResults paginates commit statuses and check runs', async () => {
  const statusPages = [];
  const checkPages = [];
  const client = {
    rest: {
      repos: {
        async getCombinedStatusForRef({ page }) {
          statusPages.push(page);
          return {
            data: {
              statuses: page === 1
                ? Array.from({ length: 100 }, (_, i) => ({ context: `status-${i}`, state: 'success' }))
                : [{ context: 'late-status', state: 'failure' }],
            },
          };
        },
      },
      checks: {
        async listForRef({ page }) {
          checkPages.push(page);
          return {
            data: {
              check_runs: page === 1
                ? Array.from({ length: 100 }, (_, i) => ({ name: `check-${i}`, conclusion: 'success' }))
                : [{ name: 'late-check', conclusion: 'failure' }],
            },
          };
        },
      },
    },
  };

  const result = await getCiResults(client, { ...ctx, headSha: 'a'.repeat(40) });
  assert.deepEqual(statusPages, [1, 2]);
  assert.deepEqual(checkPages, [1, 2]);
  assert.equal(result.statuses.at(-1).context, 'late-status');
  assert.equal(result.checkRuns.at(-1).name, 'late-check');
  assert.deepEqual(result.errors, []);
});

test('getCiResults preserves API visibility failures', async () => {
  const denied = Object.assign(new Error('Forbidden'), { status: 403 });
  const client = {
    rest: {
      repos: { async getCombinedStatusForRef() { throw denied; } },
      checks: { async listForRef() { throw denied; } },
    },
  };
  const result = await getCiResults(client, { ...ctx, headSha: 'a'.repeat(40) });
  assert.deepEqual(result.statuses, []);
  assert.deepEqual(result.checkRuns, []);
  assert.deepEqual(result.errors.map((error) => error.source), [
    'commit statuses',
    'check runs',
  ]);
  assert.ok(result.errors.every((error) => error.status === 403));
});

test('replace mode creates a comment when none exists', async () => {
  const { client, calls } = commentClient();
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'replace');
  assert.equal(res, 'created');
  assert.equal(calls.create.length, 1);
  assert.ok(calls.create[0].includes('v2'));
});

test('replace mode updates the existing report in place', async () => {
  const { client, calls } = commentClient({ existing: [{ id: 9, body: OLD_BODY }] });
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'replace');
  assert.equal(res, 'updated');
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].id, 9);
  assert.equal(calls.create.length, 0);
});

test('replace mode finds a report beyond the first 100 comments', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: 'chat' }));
  const { client, calls } = commentClient({
    pages: [firstPage, [{ id: 101, body: OLD_BODY }]],
  });
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'replace');
  assert.equal(res, 'updated');
  assert.equal(calls.update[0].id, 101);
  assert.equal(calls.create.length, 0);
});

test('replace mode creates a real report when a matching comment cannot be edited', async () => {
  const { client, calls } = commentClient({
    existing: [{ id: 9, body: OLD_BODY }],
    updateError: Object.assign(new Error('Forbidden'), { status: 403 }),
  });
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'replace');
  assert.equal(res, 'created');
  assert.equal(calls.update.length, 1);
  assert.equal(calls.create.length, 1);
});

test('append mode always creates a new comment', async () => {
  const { client, calls } = commentClient({ existing: [{ id: 9, body: OLD_BODY }] });
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'append');
  assert.equal(res, 'created');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.update.length, 0);
});

test('none mode does nothing', async () => {
  const { client, calls } = commentClient({ existing: [{ id: 9, body: OLD_BODY }] });
  const res = await upsertComment(client, ctx, NEW_BODY, HEADER, 'none');
  assert.equal(res, false);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.update.length, 0);
});

test('requestChanges submits a REQUEST_CHANGES review', async () => {
  let reviewed;
  const client = {
    rest: {
      pulls: {
        async createReview(args) {
          reviewed = args;
          return { data: {} };
        },
      },
    },
  };
  await requestChanges(client, ctx, 'fix it');
  assert.equal(reviewed.event, 'REQUEST_CHANGES');
  assert.ok(reviewed.body.includes('fix it'));
});
