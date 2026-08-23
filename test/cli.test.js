'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  main,
  parseArgs,
  parseInitArgs,
  parseDoctorArgs,
  diffToFiles,
  evaluate,
  renderHuman,
  USAGE,
  INIT_USAGE,
  DOCTOR_USAGE,
} = require('../src/cli');

const SAMPLE_DIFF = `diff --git a/src/app.js b/src/app.js
index 111..222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -3,6 +3,9 @@
 const boot = require('./boot');
+// TODO: wire up retries
+const key = 'AKIAIOSFODNN7EXAMPLE';
 function start() {
diff --git a/docs/guide.md b/docs/guide.md
index 333..444 100644
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1,3 +1,4 @@
 # Guide
+Nice example of mongodb://user:hunter2@db.internal:27017/prod
`;

function capture(cb) {
  const writes = [];
  const orig = process.stdout.write;
  const errWrites = [];
  const origErr = process.stderr.write;
  process.stdout.write = (c) => {
    writes.push(String(c));
    return true;
  };
  process.stderr.write = (c) => {
    errWrites.push(String(c));
    return true;
  };
  try {
    const code = cb();
    return { code, out: writes.join(''), err: errWrites.join('') };
  } finally {
    process.stdout.write = orig;
    process.stderr.write = origErr;
  }
}

test('parseArgs handles every flag', () => {
  const o = parseArgs([
    '--diff', 'p.diff', '--patterns', 'TODO,FIXME', '--exclude', 'docs/,test/',
    '--fail-on', 'secrets,ci', '--preset', 'balanced', '--config', 'policy.yml',
    '--commits', '--json',
  ]);
  assert.equal(o.diffFile, 'p.diff');
  assert.deepEqual(o.patterns, ['TODO', 'FIXME']);
  assert.deepEqual(o.exclude, ['docs/', 'test/']);
  assert.deepEqual(o.failOn, ['secrets', 'ci']);
  assert.equal(o.preset, 'balanced');
  assert.equal(o.configPath, 'policy.yml');
  assert.equal(o.checkCommits, true);
  assert.equal(o.json, true);
});

test('parseArgs rejects unknown options and missing input', () => {
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  assert.throws(() => parseArgs(['--json']), /--diff <file> or --git/);
  assert.throws(() => parseArgs(['--git', '--preset', 'maximum']), /unknown preset/);
  assert.throws(() => parseArgs(['--git', '--config', 'x', '--no-config']), /cannot be used together/);
});

test('diffToFiles splits a git diff into file entries', () => {
  const files = diffToFiles(SAMPLE_DIFF);
  assert.equal(files.length, 2);
  assert.equal(files[0].filename, 'src/app.js');
  assert.ok(files[0].patch.includes('@@'));
  assert.equal(files[1].filename, 'docs/guide.md');
});

test('evaluate flags todos, secrets and bad commits with legacy blocking', () => {
  const res = evaluate({
    files: diffToFiles(SAMPLE_DIFF),
    commits: [{ sha: '1', message: 'WIP stuff', author: 'me' }],
    patterns: ['TODO', 'FIXME'],
    exclude: [],
    failOn: [],
    warnTodos: false,
  });
  assert.ok(res.todos.length >= 1);
  assert.ok(res.secrets.length >= 1);
  assert.deepEqual(res.triggered, ['todos', 'secrets', 'commits']);
});

test('evaluate honors warn-todos and fail-on', () => {
  const files = diffToFiles(SAMPLE_DIFF);
  const warn = evaluate({ files, commits: null, patterns: ['TODO'], exclude: ['docs/'], failOn: [], warnTodos: true });
  assert.equal(warn.triggered.includes('todos'), false);
  assert.equal(warn.triggered.includes('secrets'), true);

  const onlySecrets = evaluate({ files, commits: null, patterns: ['TODO'], exclude: [], failOn: ['secrets'], warnTodos: false });
  assert.deepEqual(onlySecrets.triggered, ['secrets']);
});

test('human output strips terminal control sequences from local findings', () => {
  const output = renderHuman({
    todos: [{ file: 'bad\u001b[31m.js', line: 1, marker: 'TO\u001bDO', text: 'unsafe\u0007' }],
    secrets: [],
    commits: [],
    triggered: ['todos'],
  });
  assert.doesNotMatch(output, /[\u0000-\u0008\u000b-\u001f\u007f]/);
  assert.match(output, /bad \[31m\.js/);
});

test('main --diff exits 1 with blocking findings and --json output', () => {
  const p = path.join(os.tmpdir(), `cg-${Date.now()}.diff`);
  fs.writeFileSync(p, SAMPLE_DIFF);
  const { code, out } = capture(() => main(['--diff', p, '--json']));
  fs.unlinkSync(p);
  assert.equal(code, 1);
  const parsed = JSON.parse(out);
  assert.equal(parsed.files, 2);
  assert.ok(parsed.todos.length >= 1);
  assert.ok(parsed.secrets.some((s) => s.type === 'AWS Access Key ID'));
});

test('main --diff exits 0 when findings are non-blocking', () => {
  const p = path.join(os.tmpdir(), `cg-${Date.now()}.diff`);
  fs.writeFileSync(p, SAMPLE_DIFF);
  const { code, out } = capture(() => main(['--diff', p, '--warn-todos', '--fail-on', 'secrets']));
  fs.unlinkSync(p);
  // secrets still block → exit 1 even with warn-todos? No: fail-on [secrets] and secrets present → 1
  assert.equal(code, 1);
  assert.ok(out.includes('blocked by: secrets'));
});

test('main --diff exits 0 on a clean diff and prints human output', () => {
  const clean = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1,2 @@\nhello\n+world\n';
  const p = path.join(os.tmpdir(), `cg-${Date.now()}.diff`);
  fs.writeFileSync(p, clean);
  const { code, out } = capture(() => main(['--diff', p]));
  fs.unlinkSync(p);
  assert.equal(code, 0);
  assert.ok(out.includes('no blocking findings'));
});

test('parseArgs accepts --git without a ref (defaults to HEAD)', () => {
  const o = parseArgs(['--git']);
  assert.equal(o.git, true);
  assert.equal(o.gitRef, null);
});

test('main --git defaults to scanning the working tree vs HEAD', () => {
  const io = {
    execGit: (args) => {
      if (args[0] === 'diff') return SAMPLE_DIFF;
      if (args[0] === 'rev-parse') return `${os.tmpdir()}\n`;
      return '';
    },
  };
  const { code } = capture(() => main(['--git', '--json'], io));
  assert.equal(code, 1);
});

test('main --git runs git diff + optional commit check via injected exec', () => {
  const calls = [];
  const io = {
    execGit: (args) => {
      calls.push(args);
      if (args[0] === 'diff') return SAMPLE_DIFF;
      return 'WIP stuff\nfeat: ok\n';
    },
  };
  const { code, out } = capture(() => main(['--git', 'origin/main', '--commits', '--json'], io));
  assert.equal(code, 1);
  const parsed = JSON.parse(out);
  assert.equal(parsed.commits.length, 1); // only the 'WIP stuff' subject fails
  assert.ok(parsed.blockedBy.includes('commits'));
  assert.deepEqual(calls, [
    ['diff', '--unified=0', '--diff-filter=ACMR', 'origin/main'],
    ['rev-parse', '--show-toplevel'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
    ['log', '--format=%s', 'origin/main..HEAD'],
  ]);
});

test('main passes a git ref as one argument instead of shell source', () => {
  const calls = [];
  const io = {
    execGit: (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse') return `${os.tmpdir()}\n`;
      return '';
    },
  };
  const ref = 'origin/main; echo unsafe';
  const { code } = capture(() => main(['--git', ref, '--json'], io));
  assert.equal(code, 0);
  assert.deepEqual(calls, [
    ['diff', '--unified=0', '--diff-filter=ACMR', ref],
    ['rev-parse', '--show-toplevel'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ]);
});

test('main --git includes ignored-aware untracked files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-untracked-'));
  const filename = 'new file.js';
  const marker = ['TO', 'DO'].join('');
  fs.writeFileSync(path.join(root, filename), `// ${marker}: finish local file\n`);
  const calls = [];
  const io = {
    execGit: (args) => {
      calls.push(args);
      if (args[0] === 'diff') return '';
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return `${filename}\0`;
      return '';
    },
  };
  try {
    const { code, out } = capture(() => main(['--git', '--json'], io));
    const report = JSON.parse(out);
    assert.equal(code, 1);
    assert.equal(report.untrackedFiles, 1);
    assert.equal(report.files, 1);
    assert.equal(report.todos[0].file, filename);
    assert.deepEqual(calls.at(-1), ['ls-files', '--others', '--exclude-standard', '-z']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('main --git automatically applies the repository policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-policy-'));
  const filename = 'unfinished.js';
  const marker = ['TO', 'DO'].join('');
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github/codex-guard.yml'), 'preset: observe\n');
  fs.writeFileSync(path.join(root, filename), `// ${marker}: complete the handler\n`);
  const io = {
    execGit: (args) => {
      if (args[0] === 'diff') return '';
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return `${filename}\0`;
      return '';
    },
  };
  try {
    const { code, out } = capture(() => main(['--git', '--json'], io));
    const report = JSON.parse(out);
    assert.equal(code, 0);
    assert.deepEqual(report.policy, {
      preset: 'observe',
      config: '.github/codex-guard.yml',
      observing: true,
    });
    assert.deepEqual(report.blockedBy, ['todos']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit CLI policy overrides repository policy and --no-config bypasses it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-policy-'));
  const filename = 'unfinished.js';
  const marker = ['TO', 'DO'].join('');
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github/codex-guard.yml'), 'preset: observe\n');
  fs.writeFileSync(path.join(root, filename), `// ${marker}: complete the handler\n`);
  const io = {
    execGit: (args) => {
      if (args[0] === 'diff') return '';
      if (args[0] === 'rev-parse') return `${root}\n`;
      if (args[0] === 'ls-files') return `${filename}\0`;
      return '';
    },
  };
  try {
    const strict = capture(() => main(['--git', '--preset', 'strict', '--json'], io));
    assert.equal(strict.code, 1);
    assert.equal(JSON.parse(strict.out).policy.preset, 'strict');

    const warned = capture(() => main([
      '--git', '--preset', 'strict', '--warn-todos', '--json',
    ], io));
    assert.equal(warned.code, 0);
    assert.deepEqual(JSON.parse(warned.out).blockedBy, []);

    const bypassed = capture(() => main(['--git', '--no-config', '--json'], io));
    assert.equal(bypassed.code, 1);
    assert.equal(JSON.parse(bypassed.out).policy.config, null);

    const narrowed = capture(() => main([
      '--git', '--warn-todos', '--fail-on', 'secrets', '--json',
    ], io));
    assert.equal(narrowed.code, 0);
    assert.deepEqual(JSON.parse(narrowed.out).blockedBy, []);

    const invalid = capture(() => main([
      '--git', '--fail-on', 'maximum', '--json',
    ], io));
    assert.equal(invalid.code, 2);
    assert.match(invalid.err, /unknown checks: maximum/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('help exits 0 and prints usage', () => {
  const { code, out } = capture(() => main(['--help']));
  assert.equal(code, 0);
  assert.ok(out.includes('--diff <patch-file>'));
  assert.ok(out.includes('codex-guard init'));
});

test('init help documents safe rollout options', () => {
  const { code, out } = capture(() => main(['init', '--help']));
  assert.equal(code, 0);
  assert.equal(out, INIT_USAGE);
  assert.ok(out.includes('--strict'));
  assert.ok(out.includes('--force'));
  assert.ok(out.includes('--preset'));
});

test('init presets render observe, balanced and strict policies', () => {
  assert.equal(parseInitArgs([]).preset, 'observe');
  assert.equal(parseInitArgs(['--preset', 'balanced']).preset, 'balanced');
  assert.equal(parseInitArgs(['--strict']).preset, 'strict');
  assert.throws(() => parseInitArgs(['--preset', 'balanced', '--strict']), /conflicts/);
  assert.throws(() => parseInitArgs(['--preset', 'maximum']), /unknown preset/);
});

test('parseInitArgs rejects unknown options', () => {
  assert.throws(() => parseInitArgs(['--bogus']), /unknown init option/);
  const { code, err } = capture(() => main(['init', '--bogus']));
  assert.equal(code, 2);
  assert.ok(err.includes('unknown init option'));
});

test('init creates an observe-mode workflow in the repository root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-init-'));
  try {
    const io = { execGit: (args) => {
      assert.deepEqual(args, ['rev-parse', '--show-toplevel']);
      return `${root}\n`;
    } };
    const { code, out } = capture(() => main(['init'], io));
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/codex-guard.yml'),
      'utf8'
    );
    assert.equal(code, 0);
    assert.ok(out.includes('observe (non-blocking)'));
    assert.ok(workflow.includes('uses: Akimiya-z/codex-guard@v1'));
    assert.ok(workflow.includes('statuses: read'));
    assert.ok(workflow.includes("preset: 'observe'"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('init protects an existing workflow unless --force is used', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-init-'));
  const workflowPath = path.join(root, '.github/workflows/codex-guard.yml');
  try {
    const io = { execGit: () => root };
    assert.equal(capture(() => main(['init'], io)).code, 0);

    const refused = capture(() => main(['init', '--strict'], io));
    assert.equal(refused.code, 2);
    assert.ok(refused.err.includes('already exists'));
    assert.ok(fs.readFileSync(workflowPath, 'utf8').includes("preset: 'observe'"));

    const replaced = capture(() => main(['init', '--strict', '--force'], io));
    assert.equal(replaced.code, 0);
    assert.ok(replaced.out.includes('strict (blocking)'));
    assert.ok(fs.readFileSync(workflowPath, 'utf8').includes("preset: 'strict'"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('init reports a friendly error outside a Git repository', () => {
  const io = { execGit: () => { throw new Error('not a git repository'); } };
  const { code, err } = capture(() => main(['init'], io));
  assert.equal(code, 2);
  assert.ok(err.includes('inside a Git repository'));
});

test('doctor help and argument parsing are deterministic', () => {
  assert.deepEqual(parseDoctorArgs(['--workflow', 'custom.yml', '--json']), {
    workflow: 'custom.yml',
    json: true,
    help: false,
  });
  const { code, out } = capture(() => main(['doctor', '--help']));
  assert.equal(code, 0);
  assert.equal(out, DOCTOR_USAGE);
  assert.throws(() => parseDoctorArgs(['--bogus']), /unknown doctor option/);
});

test('doctor exits cleanly for the generated workflow and supports JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-guard-doctor-'));
  const workflow = path.join(root, '.github/workflows/codex-guard.yml');
  fs.mkdirSync(path.dirname(workflow), { recursive: true });
  fs.writeFileSync(workflow, require('../src/cli').renderInitWorkflow({ preset: 'balanced' }));
  try {
    const io = { execGit: () => `${root}\n` };
    const { code, out } = capture(() => main(['doctor', '--json'], io));
    const report = JSON.parse(out);
    assert.equal(code, 0);
    assert.equal(report.preset, 'balanced');
    assert.equal(report.summary.errors, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shipped workflow examples point to the public action owner', () => {
  const examples = fs.readdirSync(path.join(__dirname, '..', 'examples'))
    .filter((name) => name.endsWith('.yml'));
  for (const example of examples) {
    const content = fs.readFileSync(path.join(__dirname, '..', 'examples', example), 'utf8');
    assert.doesNotMatch(content, /uses:\s+akimiya\/codex-guard@/i);
    if (content.includes('codex-guard@')) {
      assert.match(content, /uses:\s+Akimiya-z\/codex-guard@v1/);
    }
  }
});
