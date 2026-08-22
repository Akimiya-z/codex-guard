'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', 'skills', 'codex-guard', 'SKILL.md');
const INSTALL = path.join(__dirname, '..', 'skills', 'install.sh');

function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

test('SKILL.md exists with frontmatter', () => {
  const raw = fs.readFileSync(SKILL, 'utf8');
  const parsed = parseFrontmatter(raw);
  assert.ok(parsed, 'SKILL.md must start with YAML frontmatter');
  assert.ok(parsed.meta.name, 'name required');
  assert.equal(parsed.meta.name, 'codex-guard');
  assert.ok(parsed.meta.description, 'description required');
  // skill descriptions are length-limited by agent runtimes
  assert.ok(parsed.meta.description.length <= 1024);
  // the body must actually instruct the agent
  assert.ok(parsed.body.length > 200);
  assert.ok(parsed.body.includes('node src/cli.js'));
});

test('install.sh exists and is executable-safe bash', () => {
  const raw = fs.readFileSync(INSTALL, 'utf8');
  assert.ok(raw.startsWith('#!/usr/bin/env bash'));
  assert.ok(raw.includes('.codex/skills'));
  assert.ok(raw.includes('.claude/skills'));
});