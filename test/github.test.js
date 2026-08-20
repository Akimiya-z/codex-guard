'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { upsertComment, requestChanges } = require('../src/github');

const HEADER = '## 🤖 Codex Guard';
const ctx = { owner: 'o', repo: 'r', prNumber: 3 };

function commentClient({ existing = [] } = {}) {
  const calls = { create: [], update: [] };
  const client = {
    rest: {
      issues: {
        async listComments() {
          return { data: existing };
        },
        async createComment({ body }) {
          calls.create.push(body);
          return { data: {} };
        },
        async updateComment({ comment_id: id, body }) {
          calls.update.push({ id, body });
          return { data: {} };
        },
      },
    },
  };
  return { client, calls };
}

const OLD_BODY = `${HEADER}\n\n❌ Checks failed — v1.`;
const NEW_BODY = `${HEADER}\n\n❌ Checks failed — v2.`;

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
