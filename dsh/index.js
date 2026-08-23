import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawnSync } from 'node:child_process'

export const name = 'codex-guard'
export const inject = ['tools']

/**
 * Run the codex-guard pre-submit checks inside DeepSeek Harness.
 *
 * The tool shells out to the published CLI (`npx --yes codex-guard`) so the
 * harness only needs a network connection on first use; the checks themselves
 * are the same deterministic TODO/secret/commit scans the GitHub Action runs.
 *
 * Note: the CLI exits 1 when *blocking findings exist* — that is a normal
 * report, not a crash — so we never throw on a nonzero exit code.
 */
function runGuard(ref, asJson) {
  const args = ['--yes', 'codex-guard']
  if (ref) {
    args.push('--git', ref)
  } else {
    args.push('--git') // default: uncommitted changes in the current repo
  }
  if (asJson) args.push('--json')
  const res = spawnSync('npx', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (res.error) return `codex-guard failed: ${res.error.message}`
  const out = (res.stdout || '').trim()
  if (out) return out
  return (res.stderr || '').trim() || `codex-guard exited with status ${res.status}`
}

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: 'codex_guard',
      description:
        'Run pre-submit hygiene checks on the current repository: TODO/FIXME leftovers, hardcoded secrets, and non-conventional commit subjects. Exit code 0 means clean; a report is returned either way.',
      parameters: {
        ref: {
          type: 'string',
          description:
            'Git ref to diff against, e.g. origin/main. Omit to scan uncommitted changes.',
        },
        json: {
          type: 'boolean',
          description: 'Return the machine-readable JSON report.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return runGuard(args.ref, args.json)
      },
    })
  )
}