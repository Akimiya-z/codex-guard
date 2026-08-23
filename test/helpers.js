'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PATCH = fs.readFileSync(path.join(__dirname, 'fixtures', 'patch.txt'), 'utf8');

/** Fake @actions/core with an in-memory input map and output collector. */
function fakeCore(inputs = {}) {
  const outputs = {};
  const calls = { info: [], notice: [], warning: [], setFailed: 0, checked: [] };
  const str = (v) => (v === undefined ? '' : String(v));
  const bool = (v) => (v === undefined ? undefined : String(v).toLowerCase() === 'true');

  return {
    outputs,
    calls,
    _inputs: inputs,
    getInput(name) {
      return str(inputs[name]);
    },
    getBooleanInput(name) {
      return bool(inputs[name]);
    },
    setOutput(name, value) {
      outputs[name] = String(value);
    },
    info(msg) {
      calls.info.push(msg);
    },
    notice(msg) {
      calls.notice.push(msg);
    },
    warning(msg) {
      calls.warning.push(msg);
    },
    setFailed(msg) {
      calls.setFailed += 1;
      calls.setFailedMsg = msg;
    },
    summary: { addRaw: () => ({ write: async () => {} }) },
  };
}

/** Files array shaped like pulls.listFiles response, from the fixture patch. */
function filesFromPatch() {
  // Build two file entries from the combined fixture patch.
  return [
    {
      filename: 'src/auth.py',
      patch: [
        '@@ -10,7 +10,9 @@ def login(username):',
        '     # setup connection pool',
        '     client = connect()',
        '-    return client.authenticate(username)',
        '+    # TODO: wire up real authentication',
        '+    return client.authenticate_oidc(username)',
        '+',
        '+    # existing context line, should not be flagged',
        '@@ -25,6 +26,10 @@ def rotate():',
        '     cred = load_secret("rotator")',
        '+    aws_key = "AKIAIOSFODNN7EXAMPLE"',
        '+    api_key = "P@ssw0rd-987654321"',
        '+    # FIXME: remove debug echo',
        '+    print(cred)',
        '     return cred',
      ].join('\n'),
    },
    {
      filename: 'README.md',
      patch: [
        '@@ -3,7 +3,9 @@',
        ' ## Overview',
        '-Quick start guide',
        '+Quick start guide with examples.',
        '+',
        '+> Example mongodb://user:hunter2secret@db.example.com:27017/app',
      ].join('\n'),
    },
  ];
}

function agentCommits() {
  return [
    { sha: 'a'.repeat(40), message: 'feat(auth): add OIDC login', author: 'codex' },
    { sha: 'b'.repeat(40), message: 'fix stuff', author: 'codex' },
    { sha: 'c'.repeat(40), message: '', author: 'codex' },
  ];
}

/** Fake octokit with fixed responses, recording which endpoints were hit. */
function fakeClient({ files, commits, statuses = [], checkRuns = [], repoConfig, openPrs = [] } = {}) {
  const hit = new Set();
  const bodies = [];
  const checkBodies = [];
  const octokit = {
    bodies,
    checkBodies,
    hit,
    rest: {
      pulls: {
        async listFiles() {
          hit.add('listFiles');
          return { data: files || filesFromPatch() };
        },
        async listCommits() {
          hit.add('listCommits');
          return {
            data: (commits || agentCommits()).map((c) => ({
              sha: c.sha,
              commit: { message: c.message, author: { name: c.author } },
              author: { login: c.author },
            })),
          };
        },
        async list() {
          hit.add('pulls.list');
          return { data: openPrs };
        },
        async createReview() {
          hit.add('createReview');
          return { data: {} };
        },
      },
      repos: {
        async getCombinedStatusForRef() {
          hit.add('combinedStatus');
          return { data: { state: 'mixed', statuses } };
        },
        async getContent() {
          hit.add('getContent');
          if (repoConfig) {
            return {
              data: {
                content: Buffer.from(repoConfig, 'utf8').toString('base64'),
                encoding: 'base64',
              },
            };
          }
          throw Object.assign(new Error('Not Found'), { status: 404 });
        },
      },
      checks: {
        async listForRef() {
          hit.add('listForRef');
          return { data: { check_runs: checkRuns } };
        },
        async create(body) {
          hit.add('checks.create');
          checkBodies.push(body);
          return { data: {} };
        },
      },
      issues: {
        async listComments() {
          hit.add('listComments');
          return { data: [] };
        },
        async createComment({ body }) {
          hit.add('createComment');
          bodies.push(body);
          return { data: {} };
        },
        async updateComment() {
          hit.add('updateComment');
          return { data: {} };
        },
      },
    },
    hit,
  };
  return octokit;
}

/** Minimal pull_request context. */
function prContext(overrides = {}) {
  return {
    repo: { owner: 'octo', repo: 'demo' },
    payload: {
      repository: { owner: { login: 'octo' }, name: 'demo' },
      pull_request: {
        number: 42,
        title: overrides.title || 'feat: generated by Codex',
        head: { sha: 'd'.repeat(40), ref: overrides.ref || 'codex/feat/auth' },
        labels: overrides.labels || [{ name: 'codex-generated' }],
      },
    },
  };
}

module.exports = { PATCH, fakeCore, filesFromPatch, agentCommits, fakeClient, prContext };
