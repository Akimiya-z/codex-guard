'use strict';

const yaml = require('js-yaml');

// Converts kebab-case config keys (`todo-patterns`) to the camelCase input
// names used internally (`todoPatterns`), so one config can mirror action.yml.
function camelize(key) {
  return key.replace(/-([a-z0-9])/gi, (_, c) => c.toUpperCase());
}

function configInputName(key) {
  // The public input is singular (`todo-blocking`), while the established
  // internal field is `todosBlocking`.
  return key === 'todo-blocking' ? 'todosBlocking' : camelize(key);
}

// Inputs that come from the config as YAML lists (also accepted as CSV strings).
const LIST_INPUTS = new Set([
  'agentLabels',
  'agentBranchPrefixes',
  'agentKeywords',
  'todoPatterns',
  'secretExcludePaths',
  'ignoreCheckRunNames',
  'failOn',
]);

const BOOLEAN_INPUTS = new Set([
  'gateAgentsOnly',
  'checkTodos',
  'todosBlocking',
  'checkSecrets',
  'checkCommits',
  'checkCi',
  'postComment',
  'requestChanges',
  'softFail',
  'sweep',
]);

/**
 * Load `.github/codex-guard.yml` (default branch) and parse it.
 * Returns null when the file is absent, unreadable, or not a flat object —
 * the workflow inputs are always the fallback.
 */
async function loadRepoConfig(octokit, ctx, path) {
  if (!octokit || !path) return null;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: ctx.owner,
      repo: ctx.repo,
      path,
    });
    const raw = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
    const parsed = yaml.load(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null; // absent file or unreadable → fall back to workflow inputs
  }
}

/**
 * Overlay a parsed config object onto the workflow inputs. Unknown keys are
 * ignored (typo tolerant); keys map kebab-case → camelCase and keep their type.
 */
function applyConfig(inputs, config) {
  if (!config) return inputs;
  const out = { ...inputs };
  for (const [key, value] of Object.entries(config)) {
    const camel = configInputName(key);
    if (!(camel in out)) continue;
    if (BOOLEAN_INPUTS.has(camel)) {
      if (typeof value === 'boolean') {
        out[camel] = value;
      } else if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
        out[camel] = value.toLowerCase() === 'true';
      }
    } else if (Array.isArray(value)) {
      out[camel] = value.map((v) => String(v)).filter((s) => s.trim() !== '');
    } else if (LIST_INPUTS.has(camel) && typeof value === 'string') {
      out[camel] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (typeof value === 'string' || typeof value === 'boolean') {
      out[camel] = value;
    } else if (typeof value === 'number') {
      out[camel] = String(value);
    }
  }
  return out;
}

module.exports = {
  loadRepoConfig,
  applyConfig,
  camelize,
  configInputName,
  BOOLEAN_INPUTS,
};
