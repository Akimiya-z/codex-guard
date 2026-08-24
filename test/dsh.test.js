'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const DSH_DIR = path.join(__dirname, '..', 'dsh');
const manifestPath = path.join(DSH_DIR, 'package.json');
const patchPath = path.join(DSH_DIR, 'cordis.patch.yml');
const entryPath = path.join(DSH_DIR, 'index.js');

// Some sandboxed test environments ship a sparse PATH; make sure git and npx
// (next to the running node) resolve before the tool-execute test spawns them.
process.env.PATH = [
  process.env.PATH,
  path.dirname(process.execPath),
  '/usr/bin',
  '/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
]
  .filter(Boolean)
  .join(path.delimiter);

test('bundle manifest declares dsh.bundle and ships expected files', () => {
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(pkg.name.startsWith('dsh-'), 'bundle name should start with dsh-');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(fs.existsSync(patchPath), 'patch file must exist');
  assert.ok(fs.existsSync(entryPath), 'entry must exist');
});

test("cordis patch inserts the bundle's plugin row", () => {
  const patch = yaml.load(fs.readFileSync(patchPath, 'utf8'));
  const row = patch[0].insert[0];
  assert.equal(row.id, 'codex-guard');
  assert.equal(row.name, 'dsh-codex-guard'); // must match the bundle name
});

test('entry registers a codex_guard tool against the real dsh-tools API', async () => {
  const { apply } = await import(pathToFileURL(entryPath));
  let captured = null;
  const ctx = {
    tools: {
      register(tool) {
        captured = tool;
      },
    },
  };
  assert.equal(typeof apply, 'function');
  apply(ctx);
  assert.ok(captured, 'apply must register a tool');
  assert.equal(captured.name, 'codex_guard');
  // defineTool compiles parameters into JSON Schema form
  assert.ok(captured.parameters.properties.ref, 'ref parameter expected');
  assert.equal(typeof captured.execute, 'function');
});

test('Windows DSH invocation runs npm through Node without a command shell', async () => {
  const { npxInvocation } = await import(pathToFileURL(entryPath));
  const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
  const bundledCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js';
  const invocation = npxInvocation({
    platform: 'win32',
    nodePath,
    fileExists: (filename) => filename === bundledCli,
  });
  assert.deepEqual(invocation, { command: nodePath, prefix: [bundledCli] });
  assert.equal(
    npxInvocation({ platform: 'win32', nodePath, fileExists: () => false }),
    null
  );
});

test('tool execute runs the published CLI against a local repo', async () => {
  const { apply } = await import(pathToFileURL(entryPath));
  let captured = null;
  apply({
    tools: {
      register(tool) {
        captured = tool;
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-dsh-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, opts = {}) => {
    try {
      return execFileSync('git', args, { stdio: 'ignore', ...opts });
    } catch (err) {
      err.message = `git ${args.join(' ')} cwd=${opts.cwd} -> ${err.code}: ${err.message}`;
      throw err;
    }
  };
  git(['init', '-q', '-b', 'main'], { cwd: repo });
  git(['config', 'user.email', 'd@l'], { cwd: repo });
  git(['config', 'user.name', 'd'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'app.js'), 'module.exports = {};\n');
  git(['add', '-A'], { cwd: repo });
  git(['commit', '-qm', 'feat: init'], { cwd: repo });
  // The uncommitted diff ADDS the marker and the secret.
  fs.writeFileSync(
    path.join(repo, 'app.js'),
    '// FIXME: use a pool\nconst token = "AKIAIOSFODNN7EXAMPLE";\nmodule.exports = {};\n'
  );

  const prev = process.cwd();
  process.chdir(repo);
  try {
    const out = await captured.execute({ json: true });
    const parsed = JSON.parse(out);
    // Only ADDED lines are scanned: the committed file already contained the
    // TODO, so the uncommitted diff contributes the FIXME plus the secret.
    assert.ok(parsed.todos.length >= 1, `expected a marker finding, got ${out}`);
    assert.ok(parsed.secrets.some((s) => s.type === 'AWS Access Key ID'));
  } finally {
    process.chdir(prev);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function pathToFileURL(p) {
  return require('node:url').pathToFileURL(p).href;
}
