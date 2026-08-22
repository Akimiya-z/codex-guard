'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { findSecrets, redact } = require('../src/checks/secrets');
const { filesFromPatch } = require('./helpers');

test('flags an AWS access key id', () => {
  const findings = findSecrets(filesFromPatch());
  const aws = findings.find((f) => f.type === 'AWS Access Key ID');
  assert.ok(aws, 'should find the AWS key');
  assert.equal(aws.file, 'src/auth.py');
  assert.ok(findings.length >= 2, 'should also find the other injected secrets');
});

test('flags generic hardcoded credentials and connection strings', () => {
  const findings = findSecrets(filesFromPatch());
  assert.ok(findings.some((f) => f.type === 'Hardcoded credential'));
  assert.ok(findings.some((f) => f.type === 'Connection string'));
});

test('softens matched secrets with redaction', () => {
  assert.equal(redact('AKIAIOSFODNN7EXAMPLE'), 'AKIA...MPLE');
  assert.equal(redact('short'), '****');
});

test('respects excluded paths', () => {
  const withExclude = findSecrets(filesFromPatch(), ['README.md']);
  assert.ok(!withExclude.some((f) => f.file === 'README.md'));
  assert.ok(withExclude.some((f) => f.file === 'src/auth.py'));
});

test('flags github + openai style tokens', () => {
  const patch = [
    '@@ -1,2 +1,4 @@',
    '+const gh = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";',
    '+const oa = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";',
  ].join('\n');
  const findings = findSecrets([{ filename: 'env.js', patch }]);
  assert.ok(findings.some((f) => f.type === 'GitHub Token'));
  assert.ok(findings.some((f) => f.type === 'OpenAI API Key'));
});

test('flags npm, SendGrid, Telegram, Azure, JWT and AWS-secret patterns', () => {
  // Fixtures are built at runtime: literal fake secrets in the repo would trip
  // GitHub's own push-protection (it blocked a literal SendGrid key here, in
  // exactly the way codex-guard flags on PRs).
  const seg = (n, c) => c.repeat(n);
  const npmToken = 'npm_' + seg(36, 'a');
  const sendgrid = `SG.${seg(22, 'a')}.${seg(43, 'A')}`;
  const telegram = seg(10, '1') + ':' + seg(35, 'A');
  const azure = 'DefaultEndpointsProtocol=https;AccountName=stor;AccountKey=' + seg(88, 'a');
  const jwt = `eyJ${seg(30, 'a')}.${seg(40, 'b')}.${seg(40, 'c')}`;
  const awsSecret = seg(40, 'W');
  const patch = [
    '@@ -1,1 +1,7 @@',
    `+NPM_TOKEN=${npmToken}`,
    `+sendgrid = "${sendgrid}"`,
    `+telegram = "${telegram}"`,
    `+azure = "${azure}"`,
    `+token = "${jwt}"`,
    `+aws_secret_access_key = "${awsSecret}"`,
  ].join('\n');
  const findings = findSecrets([{ filename: 'env.js', patch }]);
  const types = findings.map((f) => f.type);
  for (const t of ['npm Token', 'SendGrid API Key', 'Telegram Bot Token', 'Azure Storage Connection String', 'JWT', 'AWS Secret Key']) {
    assert.ok(types.includes(t), `expected ${t} in [${types.join(', ')}]`);
  }
});
