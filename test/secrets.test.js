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
