# 🤖 Codex Guard

![GitHub release (latest by SemVer)](https://img.shields.io/github/v/release/Akimiya-z/codex-guard)
![GitHub stars](https://img.shields.io/github/stars/Akimiya-z/codex-guard)
![License](https://img.shields.io/github/license/Akimiya-z/codex-guard)
![CI](https://github.com/Akimiya-z/codex-guard/actions/workflows/ci.yml/badge.svg)
![Docs](https://img.shields.io/badge/docs-akimiya--z.github.io%2Fcodex-guard-8b5cf6)
[![Marketplace](https://img.shields.io/badge/GitHub%20Actions%20Marketplace-Codex%20Guard%20PR%20Quality%20Gate-2088FF?logo=githubactions&logoColor=white)](https://github.com/marketplace/actions/codex-guard-pr-quality-gate)

**Docs site:** <https://akimiya-z.github.io/codex-guard>

**An automatic quality gate for AI-generated pull requests.** Stop TODO leftovers,
leaked secrets, sloppy commits and red CI from reaching `main` — with zero review
bandwidth spent on the obvious stuff.

Works with **OpenAI Codex** (cloud & CLI), **Claude Code**, **Copilot**, and any
other agent that opens PRs against your repo.

> 🐕 **Dogfooding:** this repo gates its own AI-generated PRs. See a real failing
> example on [PR #6](https://github.com/Akimiya-z/codex-guard/pull/6) and the
> workflow behind it in `.github/workflows/codex-guard.yml`.

---

## Why

AI coding agents are great at writing code and terrible at cleaning up after
themselves. In practice, agent-written PRs tend to arrive with the same handful
of problems:

- `// TODO: handle this` comments that were never meant to stay
- Hardcoded API keys and connection strings copied from a chat transcript
- Commit trails like `WIP`, `fix stuff`, `more changes` — squashed versions of
  a messy session
- A green-looking PR that actually has failing CI on the head commit

You shouldn't need a human reviewer to catch those every single time. **Codex
Guard checks the boring, deterministic things automatically, and only on PRs
that look AI-generated** — so human attention goes where it matters.

## How it works

Codex Guard runs on `pull_request`, figures out whether the PR looks
agent-generated (via label, branch prefix, or title), and then:

| Check | What it flags |
| --- | --- |
| 🧹 TODO scan | `TODO` / `FIXME` / `XXX` / `HACK` / `WIP` markers on **added lines only** |
| 🔐 Secret scan | AWS (access + secret keys), GitHub, Google, OpenAI, Anthropic, Slack, Stripe, npm, SendGrid, Telegram, Azure connection strings, JWTs, hardcoded credentials, connection strings (values are redacted in reports) |
| 💬 Commit hygiene | Subjects that don't match conventional commits, empty subjects |
| 🧪 CI status | Failing status checks **or** check runs on the PR head commit |

Each finding is posted as a GitHub **check-run annotation at the exact file and
line**, plus a human-readable summary comment on the PR.

### Honest content-scan coverage

GitHub sometimes omits the textual patch for binary or very large files. Codex
Guard now distinguishes **no findings** from **not scanned**: every report shows
the number of eligible changed files whose patches were actually inspected. A
missing patch produces a neutral, non-blocking coverage warning with the
affected paths; the JSON and Action outputs carry the same information. The
warning also appears when GitHub's pull-request files API reaches its documented
3,000-file limit.

The output below comes from a real run on this repo
([PR #6](https://github.com/Akimiya-z/codex-guard/pull/6)) — a deliberate test
PR from a `codex/` branch that left a TODO, credential-shaped fixtures and two
sloppy commits. Secret-shaped values are redacted here just as they are in
current reports:

```text
## 🤖 Codex Guard

❌ **Checks failed — review the findings before merging.**

| Check | Result |
| --- | --- |
| TODO / FIXME scan | ⚠️ 2 |
| Secret scan | ⚠️ 3 |
| Commit hygiene | ⚠️ 2 |
| CI status | ✅ |

**Unfinished work**
- `scripts/sync.js:4` — `FIXME`: const aws = 'AKIA...MPLE'; // FIXME: move this to a secret store
- `scripts/sync.js:2` — `TODO`: // TODO: wire up real retry with exponential backoff.
**Potential leaked secrets**
- `scripts/sync.js:4` — AWS Access Key ID `AKIA...MPLE`
- `scripts/sync.js:5` — Connection string `post...prod`
- `scripts/sync.js:7` — OpenAI API Key `sk-p...6789`
**Commit hygiene**
- `7c84ae1` — _WIP stuff_ (by Akimiya-z)
- `1affcf8` — _tmp_ (by Akimiya-z)

> Detected as an AI-generated PR (branch prefix "codex/").
```

## Quick start

From the root of your Git repository:

```bash
npx --yes codex-guard init
git add .github/workflows/codex-guard.yml
git commit -m "ci: add Codex Guard"
```

The installer starts in **observe mode**: findings are annotated, but they do
not fail the workflow while you tune the policy. Three setup presets keep the
rollout explicit:

| Preset | Command | Behavior |
| --- | --- | --- |
| Observe | `npx --yes codex-guard init` | Report everything without blocking. |
| Balanced | `npx --yes codex-guard init --preset balanced` | Block secrets, commit hygiene, and red CI; warn on unfinished markers. |
| Strict | `npx --yes codex-guard init --preset strict` | Block every default finding. `--strict` remains an alias. |

Prefer to add it by hand? The generated workflow is:

```yaml
# Generated by codex-guard init
name: Codex Guard
on:
  pull_request:

permissions:
  contents: read
  statuses: read
  pull-requests: write
  checks: write

jobs:
  codex-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: Akimiya-z/codex-guard@v1
        with:
          preset: 'observe'
```

That's it. Codex Guard now reports on matching PRs without blocking them.

> Upgrading an existing workflow? Add `statuses: read` to its `permissions`
> block. `checks: write` already includes read access for check runs. Without
> status access, Codex Guard reports incomplete CI visibility and returns a
> neutral result instead of claiming every check is green.

One-click from the [GitHub Actions Marketplace](https://github.com/marketplace/actions/codex-guard-pr-quality-gate).

### Turn on enforcement

After a few representative PRs, choose how strongly to enforce:

```yaml
- uses: Akimiya-z/codex-guard@v1
  with:
    preset: 'balanced' # or 'strict'
```

`balanced` warns on unfinished markers while blocking secrets, commit hygiene,
and red CI. `strict` blocks every default finding. For a custom mix, use
`fail-on` and the individual inputs. Then require the status check under
**Settings → Branches → Require status checks → `Codex Guard`**. A blocking
finding will prevent the PR from merging until it is resolved (or the PR is
marked with an `ignore` label — see "Opting out").

## Detecting agent PRs

By default Codex Guard **only gates PRs it believes were written by an agent**,
so human-authored PRs are never slowed down:

- **Label** matches one of `codex-generated`, `agentic`, `ai-generated`
- **Branch** starts with `codex/`, `copilot/`, `claude-auto`, `gh-codex/`
- **Title** contains `Generated by Codex`, `Generated by Claude`, `Generated by Copilot`

All of these are configurable — or set `gate-agents-only: false` to gate every PR.

### Opting out of a specific PR

Add a label named `codex-guard-ignore` (configurable) to a PR and Codex Guard
will pass it without running checks. Useful when a human has already reviewed
and accepted the changes.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `preset` | _(empty)_ | Policy baseline: `observe`, `balanced`, or `strict`. Empty preserves the pre-preset behavior. Repository policy can override it. |
| `github-token` | `${{ github.token }}` | Token with write access to checks and PRs. |
| `gate-agents-only` | `true` | Only gate PRs detected as agent-generated. |
| `agent-labels` | `codex-generated,agentic,ai-generated` | Labels marking an agent PR. |
| `agent-branch-prefixes` | `codex/,copilot/,claude-auto,gh-codex/` | Branch prefixes marking an agent PR. |
| `agent-keywords` | `Generated by Codex,Generated by Claude,Generated by Copilot` | Title keywords marking an agent PR. |
| `ignore-label` | `codex-guard-ignore` | PR label that skips all checks. |
| `check-todos` | `true` | Scan added lines for unfinished-work markers. |
| `todo-patterns` | `TODO,FIXME,XXX,HACK,WIP` | Markers to flag. |
| `todo-blocking` | `true` | Fail on TODO findings (`false` = warn only). |
| `check-secrets` | `true` | Scan added lines for hardcoded secrets. |
| `secret-exclude-paths` | _(empty)_ | File path substrings to skip (e.g. `README,test/fixtures`). |
| `check-commits` | `true` | Validate commit subjects. |
| `commit-pattern` | conventional commit regex | Regex subjects must match. |
| `check-ci` | `true` | Fail on failing CI for the head commit. |
| `ignore-check-run-names` | _(empty)_ | Check/context names to ignore when assessing CI. |
| `post-comment` | `true` | Post a report comment on failures. |
| `comment-mode` | `replace` | `replace` updates the previous report in place (one comment per PR), `append` posts a new one each run, `none` never posts. |
| `request-changes` | `false` | Also submit a formal `REQUEST_CHANGES` review on blocking findings (opt-in; needs `pull-requests: write`). |
| `notify-users` | _(empty)_ | Comma-separated usernames to @-mention in the report comment on blocking findings. |
| `soft-fail` | `false` | Report findings with a neutral check-run but never fail the workflow. |
| `config-path` | `.github/codex-guard.yml` | Optional per-repo policy file (on the default branch) overriding workflow inputs. |
| `fail-on` | _(empty)_ | Comma-separated blocking checks: `todos,secrets,commits,ci`. Empty = legacy behavior; a subset makes excluded checks non-blocking. |
| `sweep` | `false` | Scan every open agent PR instead of a single one (use with `workflow_dispatch`). |
| `sweep-label` | _(empty)_ | Only sweep PRs carrying this label. |
| `sweep-base` | `main` | Only sweep PRs targeting this base branch. |

### CI results are never guessed

Codex Guard reads both commit statuses and check runs, follows every results
page up to GitHub's 3,000-result safety cap, and treats every completed
non-success conclusion as a failure. Pending checks produce a neutral result,
not a premature green check. If one GitHub CI API is unavailable, the report is
neutral and explicitly says visibility is incomplete; if both are unavailable,
the CI check fails closed. Previous Codex Guard check runs are ignored so a
rerun cannot inherit its own old failure.

## Configuration file

**AGENTS.md-aware:** if the repository's `AGENTS.md` or `CLAUDE.md` states a
commit convention as a backticked regex (e.g. "commits must match
`^JIRA-[0-9]+: .+$`"), Codex Guard applies it as a **last-resort default** when
no `commit-pattern` input or config key is set — action and CLI both.

Every input above can be overridden per-repo with a `.github/codex-guard.yml`
file on the default branch — so agents can't just loosen the policy in their PR.
Unknown keys are ignored (typo tolerant).

```yaml
# .github/codex-guard.yml
preset: balanced
gate-agents-only: true
agent-labels:
  - codex-generated
  - agentic
todo-patterns:
  - TODO
  - FIXME
  - XXX
secret-exclude-paths:
  - README.md
  - docs/
comment-mode: replace
request-changes: true
```

A copy-paste template lives at [`examples/codex-guard.yml`](examples/codex-guard.yml).
Policy resolution is deterministic: the workflow `preset` supplies a baseline,
the repository `preset` replaces that baseline, and individual repository keys
win last. This keeps existing workflows compatible because an empty workflow
`preset` retains the legacy defaults.

### Diagnose an installation

Run the read-only local doctor after installing or changing policy:

```bash
npx --yes codex-guard doctor
npx --yes codex-guard doctor --json  # machine-readable output
```

It checks the pull-request trigger, Action step, effective workflow/job
permissions, setup preset, policy YAML, unknown keys, boolean values,
`comment-mode`, and `fail-on`. It exits `1` for configuration errors and `0`
when only warnings or passes remain. This is a local-file diagnostic; GitHub
branch protection and organization policy still live in repository settings.

## Local dry-run (CLI)

The CLI installs the workflow and previews the same checks locally before CI —
no token or waiting:

```bash
# install the GitHub workflow (safe observe mode by default)
npx --yes codex-guard init

# scan a diff from npm — no install needed (v1.7.0+)
npx --yes codex-guard --diff <(git diff origin/main)

# from this repo's source
git diff origin/main > /tmp/patch.diff
node src/cli.js --diff /tmp/patch.diff

# or straight against a ref (bare `--git` scans tracked + untracked changes)
npx --yes codex-guard --git --commits
node src/cli.js --git origin/main --commits
```

PowerShell does not support Bash process substitution (`<(...)`). Save the
diff to a temporary UTF-8 file instead:

```powershell
$patch = New-TemporaryFile
try {
  git diff origin/main | Set-Content -LiteralPath $patch -Encoding utf8
  npx --yes codex-guard --diff $patch
} finally {
  Remove-Item -LiteralPath $patch
}
```

Exit codes: `0` = no blocking findings, `1` = blocking findings, `2` = usage
error. `--json` prints the raw report (same shape as the `findings-json`
output) for scripts. In `--git` mode the CLI automatically loads
`.github/codex-guard.yml`, so local content checks use the same preset,
patterns, exclusions, and blocking rules as the Action. Use `--preset` or
individual flags for an explicit local override, `--config <path>` for another
policy file, or `--no-config` to bypass repository policy. Explicit CLI flags
win over the loaded file. Commit hygiene is checked only when `--commits` is
passed. Git-ignored files stay ignored; ordinary untracked files are treated as
all-added patches, so a new file is scanned before its first `git add`. Binary
or untracked files larger than 8 MiB are listed explicitly as unscanned instead
of being silently treated as clean.

## Agent skill (pre-submit self-check)

Same checks, one level further up: packed as a **skill**, so Codex or Claude
Code run them _themselves_ before opening a PR — the CI gate then never sees a
dirty diff that the agent didn't already spot locally. This repo ships the
skill in `skills/codex-guard/SKILL.md`; install it with:

```bash
bash skills/install.sh              # installs for Codex and Claude Code
# or copy skills/codex-guard/ into ~/.codex/skills/ or ~/.claude/skills/
```

The skill tells the agent to run `node src/cli.js --git --commits` before
submitting, fix TODO/secret/commit findings, and only open the PR once the
checks pass (or the exception is documented in the description).

## Codex plugin

The same skill is packaged as an official **Codex plugin** (skill-only form,
schema follows `openai/plugins`): `plugins/codex-guard/.codex-plugin/plugin.json`
plus a marketplace manifest at `.agents/plugins/marketplace.json`. Codex users
can add this repository as a plugin marketplace from the Codex app or CLI —
install steps are in OpenAI's plugin docs:
<https://developers.openai.com/codex/plugins/build>.

```text
plugins/codex-guard/.codex-plugin/plugin.json
plugins/codex-guard/skills/codex-guard/SKILL.md
.agents/plugins/marketplace.json
```

Once installed, Codex runs the pre-submit checks itself before opening or
updating a PR — same behavior as the standalone skill, one packaging step
closer to discoverable on GitHub (see the `codex-plugin` topic).

## DeepSeek Harness plugin (dsh)

A DSH bundle lives in `dsh/`: it declares a `dsh.bundle` manifest and registers
a `codex_guard` **tool** that DeepSeek Harness agents can call to pre-flight an
agent-authored diff before it becomes a PR.

```text
dsh/
├── package.json        # dsh.bundle manifest (name: dsh-codex-guard)
├── cordis.patch.yml    # the layer a profile applies
└── index.js            # registers the codex_guard tool (dsh-tools API)
```

The tool shells out to the published CLI (`npx --yes codex-guard --git`) in the
current working directory, so it gets the same deterministic report the CI gate
uses. Node API compatibility is **tested against the real `@deepseek-ai/dsh-tools`
registry packages** (see `test/dsh.test.js`), including an end-to-end run in a
throwaway git repo.

## Outputs

| Output | Description |
| --- | --- |
| `policy-preset` | Selected policy baseline: `observe`, `balanced`, `strict`, or `custom`. Individual policy keys may still override it. |
| `result` | `pass`, `fail`, or `skipped`. |
| `detected-agent` | `true` / `false` — whether the PR looked agent-generated. |
| `failed-checks` | Comma-separated list of failed checks (`todos,secrets,commits,ci`). |
| `todo-count` / `secret-count` / `commit-count` | Findings per category. |
| `ci-failure-count` | Number of failing CI checks. |
| `content-scan-coverage` | Text patches scanned / eligible files, such as `12/13`, or `disabled`. |
| `unscanned-file-count` | Eligible files GitHub did not provide a textual patch for. |
| `findings-json` | JSON of the full report — pipe it into later steps to gate more or build dashboards. |
| `sweep-scanned` / `sweep-failed` | Sweep mode: agent PRs inspected / with blocking findings. |
| `sweep-report` / `sweep-json` | Sweep mode: markdown report (also in the run summary) / per-PR JSON. |

## Sweeping existing PRs

Adopting Codex Guard doesn't have to be retrospective — run a **sweep** to
inspect every currently-open agent-generated PR in one go. Add a `schedule`
trigger (the example ships with a weekly Monday run) for a zero-touch weekly
agent-PR health check:

```yaml
on:
  workflow_dispatch:
# … uses: Akimiya-z/codex-guard@v1 with: { sweep: 'true' }
```

The report is written to the run summary and `sweep-report` output (per-PR
numbers in `sweep-json`). No per-PR comments or check-runs are posted.
Use `sweep-label` to limit the run to PRs carrying a particular label.
Copy-paste at [`examples/sweep.yml`](examples/sweep.yml).

## Examples

**Gate everything, and skip secrets scanning on docs:**

```yaml
steps:
  - uses: Akimiya-z/codex-guard@v1
    with:
      gate-agents-only: 'false'
      secret-exclude-paths: 'README.md,docs/'
```

**Observe first, enforce later:**

```yaml
steps:
  - uses: Akimiya-z/codex-guard@v1
    with:
      preset: 'observe'
```

**Integrate with a tool that adds the agent label automatically:**

If your agent has a GitHub App or a bot that labels PRs, current Codex Guard will
respect whatever label you configure — and fails open (passes) when a PR has no
signal at all.

**Keep gating agent PRs from forks:**

Use `pull_request_target` so the check runs with your repo's write token. The
action reads the fork PR's files, commits and head SHA from the event payload —
no extra config. Copy-paste at [`examples/forks.yml`](examples/forks.yml).

## How it compares

| Tool | What it does | Why you'd also want Codex Guard |
| --- | --- | --- |
| **Branch protection** | Blocks merges without required reviews/checks | It's the _policy_; Codex Guard is the _check_ that enforces agent-hygiene rules on a PR. |
| **Secret scanners** (gitleaks, TruffleHog) | Deep secret detection across history | Use **in addition** — ours is a cheap diff-scoped regex pass, not a replacement. |
| **Linters / formatters** | Style and static-analysis gates | We catch _workflow_ issues agents leave behind (TODO, secrets, commit hygiene, red CI) that linters don't. |
| **AI review bots** (CodeRabbit, etc.) | LLM-powered PR review | Great — and slow/opinionated with per-review token cost. Codex Guard is deterministic, fast, **free to run in CI**, and gate-able without debate. |
| **Agent self-review hooks** | Agent checks its own output | Defaults fail; a neutral deterministic gate doesn't nod along. |

## Community

- **Ask & discuss** — questions, setups, and roadmap voting live in
  [GitHub Discussions](https://github.com/Akimiya-z/codex-guard/discussions);
  bug reports and feature requests go through the
  [issue templates](https://github.com/Akimiya-z/codex-guard/issues/new/choose).
- **Good first issues** are tagged [`good first issue`](https://github.com/Akimiya-z/codex-guard/labels/good%20first%20issue)
  and `help wanted` — the contribution guide is in
  [CONTRIBUTING.md](CONTRIBUTING.md).
- **Roadmap is feedback-driven**: the fastest way to influence the next release
  is to open a feature request and vote on it in Discussions.
- Every external contribution gets called out in the release notes. Thank you —
  this project lives on its users' feedback.

## Development

```bash
npm install
npm test          # node:test — no framework required
npm run check     # syntax-check every source file
npm run build     # rebuild the checked-in Action bundle
```

Consult `CONTRIBUTING.md` before opening a PR — it covers the release process
(rebuild `dist/`, tag `v1.x`). See [`CHANGELOG.md`](./CHANGELOG.md) for
release history. Copy-paste workflows live in `examples/`, and `docs/` explains
how to record the demo GIF and smoke-test locally.

## Limitations

- Secret detection is **regex-based on purpose** — it catches the obvious
  mistakes cheaply, but it is not a replacement for a real secret scanner
  (use [gitleaks](https://github.com/gitleaks/gitleaks) or
  [zizmor](https://github.com/woodruffw/zizmor) in addition).
- The TODO scan only sees lines **added by this PR** — it won't nag you about
  pre-existing comments.
- GitHub may omit textual patches for binary or very large files. Those files
  cannot be content-scanned. Codex Guard reports their paths and uses a neutral
  check conclusion instead of silently claiming full coverage, but a
  repository-wide secret scanner should remain the authoritative control.
- GitHub's [pull-request files endpoint](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files)
  returns at most 3,000 files. Reaching that limit is reported as incomplete
  coverage because additional files may be absent.
- Commit statuses and check runs also have a conservative 3,000-result safety
  cap per API. Reaching it is reported as incomplete CI visibility rather than
  silently ignoring later results.
- The local CLI scans ordinary untracked files, but reports binary files and
  untracked files larger than 8 MiB as unscanned. Git-ignored files are omitted
  by design.
- Agent detection is intentionally heuristic. Set `gate-agents-only: false`
  when coverage matters more than distinguishing human and agent PRs.
- Runs on `pull_request` events; for fork contributions use
  `pull_request_target` (see [`examples/forks.yml`](examples/forks.yml)) and
  supply a token with the right scope.

## Roadmap

- [x] Auto-`request changes` instead of only failing the check (opt-in)
- [x] Replace/update the report comment in place across runs
- [x] Config file support (`.github/codex-guard.yml`) for per-repo policy
- [x] Agent skill (SKILL.md) for pre-submit self-checks
- [x] `workflow_dispatch` sweep of existing agent PRs
- [x] Published to npm (`npx codex-guard`)
- [x] One-command observe-mode installer (`npx codex-guard init`)
- [x] Observe/balanced/strict installer presets and local setup doctor
- [x] Local scanning of non-ignored, untracked files
- [x] Shared Action/CLI presets with automatic local repository policy loading

_Dropped by design: AI whole-PR summary gates — per-token LLM costs contradict
the project's free, deterministic positioning. Codex Guard stays zero-cost._

## License

[MIT](./LICENSE)
