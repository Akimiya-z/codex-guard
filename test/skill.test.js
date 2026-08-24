'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', 'skills', 'codex-guard', 'SKILL.md');
const INSTALL = path.join(__dirname, '..', 'skills', 'install.sh');
const PLUGIN_MANIFEST = path.join(__dirname, '..', 'plugins', 'codex-guard', '.codex-plugin', 'plugin.json');
const PLUGIN_SKILL = path.join(__dirname, '..', 'plugins', 'codex-guard', 'skills', 'codex-guard', 'SKILL.md');
const MARKETPLACE = path.join(__dirname, '..', '.agents', 'plugins', 'marketplace.json');

function parseFrontmatter(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(normalized);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: normalized.slice(m[0].length) };
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
  const lf = raw.replace(/\r\n/g, '\n');
  assert.ok(parseFrontmatter(lf.replace(/\n/g, '\r\n')), 'CRLF frontmatter must parse');
});

test('install.sh exists and is executable-safe bash', () => {
  const raw = fs.readFileSync(INSTALL, 'utf8');
  assert.ok(raw.startsWith('#!/usr/bin/env bash'));
  assert.ok(raw.includes('.codex/skills'));
  assert.ok(raw.includes('.claude/skills'));
});

test('Codex plugin manifest follows the official schema', () => {
  const manifest = JSON.parse(fs.readFileSync(PLUGIN_MANIFEST, 'utf8'));
  assert.equal(manifest.name, 'codex-guard');
  assert.equal(typeof manifest.version, 'string');
  assert.equal(manifest.skills, './skills/');
  assert.ok(manifest.repository.startsWith('https://github.com/Akimiya-z/'));
  assert.equal(manifest.license, 'MIT');
  assert.ok(manifest.interface.displayName);
  assert.ok(manifest.interface.defaultPrompt.length > 50);
});

test('plugin ships the same SKILL.md as the standalone skill', () => {
  assert.equal(
    fs.readFileSync(PLUGIN_SKILL, 'utf8'),
    fs.readFileSync(SKILL, 'utf8'),
    'plugin skill must stay in sync with skills/codex-guard/SKILL.md'
  );
});

test('marketplace manifest references the plugin', () => {
  const market = JSON.parse(fs.readFileSync(MARKETPLACE, 'utf8'));
  assert.equal(market.name, 'codex-guard');
  const plugin = market.plugins.find((p) => p.name === 'codex-guard');
  assert.ok(plugin, 'marketplace must list codex-guard');
  assert.equal(plugin.source.path, './plugins/codex-guard');
  assert.equal(plugin.policy.installation, 'AVAILABLE');
});
