'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { inspectRepository, inspectConfig, renderDoctor } = require('../src/doctor');
const { renderInitWorkflow } = require('../src/cli');

function repository(workflow, config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-doctor-'));
  const workflowPath = path.join(root, '.github/workflows/codex-guard.yml');
  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(workflowPath, workflow);
  if (config !== undefined) {
    fs.writeFileSync(path.join(root, '.github/codex-guard.yml'), config);
  }
  return root;
}

test('doctor accepts a generated workflow and identifies its preset', () => {
  const root = repository(renderInitWorkflow({ preset: 'observe' }));
  try {
    const report = inspectRepository({ root });
    assert.equal(report.summary.errors, 0);
    assert.equal(report.summary.warnings, 0);
    assert.equal(report.preset, 'observe');
    assert.match(renderDoctor(report), /0 error\(s\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('doctor catches missing permissions and malformed policy values', () => {
  const workflow = renderInitWorkflow({ preset: 'strict' })
    .replace('  statuses: read\n', '')
    .replace("preset: 'strict'", "preset: 'maximum'");
  const root = repository(workflow, [
    'preset: [observe]',
    'comment-mode: overwrite',
    'fail-on: [secrets, unknown]',
    'check-ci: sometimes',
    'typo-input: true',
    '',
  ].join('\n'));
  try {
    const report = inspectRepository({ root });
    const codes = report.checks.map((check) => check.code);
    assert.ok(report.summary.errors >= 4);
    assert.ok(report.summary.warnings >= 1);
    assert.ok(codes.includes('permissions-insufficient'));
    assert.ok(codes.includes('workflow-preset'));
    assert.ok(codes.includes('config-preset'));
    assert.ok(codes.includes('config-comment-mode'));
    assert.ok(codes.includes('config-fail-on-value'));
    assert.ok(codes.includes('config-boolean'));
    assert.ok(codes.includes('config-unknown'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('doctor refuses workflow paths outside the repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-doctor-'));
  try {
    const report = inspectRepository({ root, workflowPath: '../outside.yml' });
    assert.equal(report.summary.errors, 1);
    assert.equal(report.checks[0].code, 'workflow-path');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inspectConfig accepts list syntax and recognized booleans', () => {
  const checks = inspectConfig(
    { 'fail-on': ['todos', 'ci'], 'soft-fail': 'false' },
    new Set(['fail-on', 'soft-fail'])
  );
  assert.deepEqual(checks.map((check) => check.level), ['pass']);
});

test('doctor output strips terminal control sequences', () => {
  const output = renderDoctor({
    checks: [{ level: 'warn', message: 'unsafe\u001b[31m' }],
    summary: { errors: 0, warnings: 1, passed: 0 },
  });
  assert.doesNotMatch(output, /\u001b/);
});
