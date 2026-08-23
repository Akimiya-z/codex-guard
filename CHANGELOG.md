# Changelog

All notable changes to Codex Guard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.14.0] - 2026-08-24

### Added

- `codex-guard doctor` performs read-only local diagnostics for workflow YAML,
  pull-request triggers, Action steps, permissions, policy keys and values,
  and the effective setup mode. `--json` provides machine-readable results.
- The installer now exposes `observe`, `balanced`, and `strict` presets through
  `init --preset`; the existing `--strict` flag remains compatible.
- Local `--git` scans now include non-ignored untracked files before their
  first `git add`. Binary and untracked files above the 8 MiB safety limit are
  reported explicitly as unscanned.

### Fixed

- Per-repository policy now coerces quoted `"true"` and `"false"` values to
  booleans instead of treating both as truthy, and correctly maps the public
  `todo-blocking` input to its internal field.
- Local human-readable CLI and doctor output strip terminal control characters
  from repository-controlled text.
- Unfinished-work source context is normalized and bounded before it reaches
  JSON output, preventing generated or minified lines from inflating reports.
- Unfinished-work markers embedded in identifiers such as `todo-blocking` or
  `todo_item` are no longer reported as standalone unfinished-work findings.

## [1.13.0] - 2026-08-24

### Added

- GitHub Copilot coding-agent branches (`copilot/`) are now detected by
  default.
- CI status and check-run queries now paginate up to a conservative
  3,000-result safety cap and expose incomplete visibility in reports and
  `findings-json`.

### Changed

- Pending CI is neutral instead of prematurely green. Every completed
  non-success GitHub check conclusion fails, one unavailable CI API is neutral
  with a warning, and both unavailable CI APIs fail closed.
- Generated and copy-paste workflows grant `statuses: read`; sweep workflows
  also grant `checks: read`.
- Internal workflows pin GitHub-maintained Actions by full commit SHA and run
  an exact, lockfile-installed `action-validator` version offline.

### Fixed

- Escaped and bounded attacker-controlled PR, commit, file and finding text in
  Markdown reports, and passed sweep output to shell steps through an
  environment variable to prevent workflow script injection.
- `sweep-label` now actually filters sweep candidates.
- Previous Codex Guard check runs no longer feed their own failures back into
  reruns.
- Report comment replacement now paginates beyond 100 comments and falls back
  to creating a genuine report if a user copies the report header into a
  comment the Action cannot edit.

## [1.12.0] - 2026-08-24

### Added

- Reports content-scan coverage separately from findings so missing GitHub
  patches cannot look like a clean scan. Binary/large-file blind spots and the
  3,000-file API limit now produce a neutral, non-blocking warning with bounded
  path details.
- Added `content-scan-coverage` and `unscanned-file-count` Action outputs, plus
  coverage data in `findings-json` and sweep reports.

### Fixed

- Declared the existing `ci-failure-count` output in `action.yml` so it appears
  in generated Action documentation and editor tooling.

## [1.11.0] - 2026-08-24

### Added

- `npx --yes codex-guard init` installs a safe observe-mode GitHub workflow in
  one command. `--strict` enables blocking immediately, while `--force`
  explicitly replaces an existing workflow.

### Fixed

- Corrected the GitHub Action owner across the bundled workflow examples and
  added a regression test for every example.

## [1.10.0] - 2026-08-24

### Fixed

- Secret-shaped values are now redacted from every exported source context,
  including `findings-json` and TODO report lines.
- `soft-fail` now creates a neutral check-run and uses observe-mode wording
  instead of publishing a contradictory failure conclusion.
- Commit hygiene inspection paginates through PRs with more than 100 commits.
- CLI git references are passed directly to `git` without shell interpolation.
- Local git scans exclude deleted files and allow larger diffs without
  exhausting the child-process output buffer.

### Changed

- Updated the GitHub Actions runtime libraries and removed all known production
  dependency audit findings.
- GitHub now executes a checked-in `dist/` bundle; `node_modules` is no longer
  committed, and CI verifies the bundle is up to date.
- Added a GitHub OIDC Trusted Publishing workflow for future npm releases, with
  automatic provenance and no long-lived registry token.

## [1.9.0] - 2026-08-23

### Added

- **DeepSeek Harness (dsh) plugin bundle** (`dsh/`): declares a `dsh.bundle`
  manifest and registers a `codex_guard` tool via the official
  `@deepseek-ai/dsh-tools` API. The tool runs the published CLI
  (`npx --yes codex-guard --git`) against the current repo, so DSH agents get
  the same deterministic report the CI gate uses. Tests exercise the real
  dsh-tools packages end-to-end in a throwaway git repo.
- npm package now ships `dsh/`; repo topics include `dsh-plugin`.

## [1.8.0] - 2026-08-23

### Added

- **Codex plugin** (skill-only form): `plugins/codex-guard/.codex-plugin/plugin.json`
  follows the official `openai/plugins` schema, with a marketplace manifest at
  `.agents/plugins/marketplace.json` so Codex users can add this repo as a
  plugin marketplace. Tests pin the plugin skill to the standalone SKILL.md and
  validate both manifests.
- npm package now ships `plugins/` and `.agents/` alongside `skills/`.

## [1.7.1] - 2026-08-22

### Added

- **More secret patterns**: npm tokens, SendGrid API keys, Telegram bot
  tokens, Azure storage connection strings, JWTs, and explicit AWS secret keys
  (all redacted in reports).

### Positioning

- The optional AI whole-PR summary is BYO-LLM-key only; the deterministic
  checks are the free default (per-review token costs are what Codex Guard
  exists to avoid).

## [1.7.0] - 2026-08-22

### Added

- **Docs site** (GitHub Pages): a self-contained landing page at
  <https://akimiya-z.github.io/codex-guard> mirroring the README (badges,
  setup, config, CLI, skill, sweep, comparisons) — a linkable artifact for
  launch posts.
- **`notify-users` input**: @-mention owners in the report comment when
  findings are blocking (borrowed from gitleaks' notify pattern).
- **CI hardening**: every workflow YAML is validated with action-validator;
  a coverage report job runs `node --test --experimental-test-coverage`.
- **Published to npm** (`codex-guard@1.7.0`): `npx -y codex-guard` works with
  no install — verified end-to-end from the registry.

## [1.6.0] - 2026-08-22

### Added

- **Sweep mode** (`sweep: true` on `workflow_dispatch`): inspect every open
  agent-generated PR in one run and write a report to the run summary +
  `sweep-report`/`sweep-json` outputs. Optional `sweep-base` / `sweep-label`
  filters. No per-PR comments or check-runs. Borrowed from gitleaks-style
  scheduled scans + reviewdog multi-target reporting. `workflow_dispatch`
  without `pr-number` sweeps automatically.
- `examples/sweep.yml` copy-paste workflow.

### Changed

- CI matrix now tests Node 22 + 24 (node20 is deprecated on GitHub Actions).
- Per-PR inspection extracted into a shared `inspectPr` used by both the
  single-PR gate and the sweep.

## [1.5.1] - 2026-08-22

### Changed

- **npm-ready packaging**: `files` whitelist (action.yml, src, examples,
  skills, docs), `repository`/`homepage`/`bugs` metadata, `prepublishOnly`
  gate; verified locally end-to-end with `npm pack` → install → run the
  `codex-guard` bin. Publishing to npm (owner login) makes
  `npx codex-guard` work everywhere, which the skill already references.
- **Branch protection** enabled on `main` (required checks: `Codex Guard` +
  `CI`, strict) — the repository now enforces the same gate it recommends.
- Issue templates (bug report + feature request) added.
- Syntax check now also covers `test/*.js`.

## [1.5.0] - 2026-08-22

### Added

- **Agent skill** (`skills/codex-guard/SKILL.md` + `skills/install.sh`): a
  pre-submit self-check pack for Codex / Claude Code — the agent runs the
  local CLI (`node src/cli.js --git --commits`) before opening a PR and fixes
  TODO/secret/commit findings first, so the CI gate never sees a dirty diff.
  Frontmatter validated by tests.
- README: "Agent skill" section with install one-liners.

## [1.4.0] - 2026-08-21

### Added

- **Local dry-run CLI** (`src/cli.js`, `codex-guard` bin): run the TODO and
  secret checks (plus commit hygiene with `--commits`) against a local unified
  diff before CI — `node src/cli.js --git origin/main`. Same findings, same
  blocking rules, `--json` output mirrors `findings-json`, exit codes 0/1/2.
  Borrowed from the reviewdog / PR-Agent "try it locally" pattern.

## [1.3.0] - 2026-08-21

### Added

- **Per-repo config file** (`.github/codex-guard.yml`, on the default branch).
  Any documented input can be overridden there, so policy lives in the repo —
  typically better than per-workflow inputs when many workflows consume it.
  Path configurable via `config-path`; unknown keys are ignored.
- **`fail-on` selector**: choose which checks are blocking
  (`todos,secrets,commits,ci`). Excluded checks still report but no longer
  fail the run or block merges — borrowed from reviewdog's `fail-level`.
- **`findings-json` output**: the full run report as JSON for downstream steps
  (dashboards, extra gates, posting elsewhere) — borrowed from Claude Code
  Action's structured outputs.

### Changed

- Policy inputs can now also come from YAML lists (not just CSV strings).
- Config is resolved on the default branch via the API before detection, so
  `gate-agents-only` etc. can be overridden by the repo.

## [1.2.0] - 2026-08-21

### Added

- `comment-mode` input (`replace` | `append` | `none`). `replace` (default)
  updates the previous report comment **in place**, so a PR keeps exactly one
  living Codex Guard comment no matter how many times it runs — no more
  comment spam per push.
- `request-changes` input. When findings are blocking, Codex Guard can submit
  a formal `REQUEST_CHANGES` review on the PR (opt-in; requires
  `pull-requests: write`), turning it into a real review gate for teams that
  require reviews.

### Changed

- Report comment updates are now in-place by default instead of "first one
  wins" — verified in production on this repo.

## [1.1.0] - 2026-08-20

### Changed

- Run on the **node24** runtime (node20 is deprecated on GitHub Actions and
  was emitting a warning on every run).
- Dropped commit-hygiene inline annotations: they had no real file/line anchor
  (a bogus `?` path). Commit findings stay in the check summary and the PR
  comment.
- README now shows **real dogfood output** verbatim from this repo's PR #6.

### Fixed

- `uses:` owner casing: docs/examples referenced `akimiya/codex-guard`, which
  the Actions runtime could not resolve; corrected to `Akimiya-z/codex-guard`
  everywhere.
- Project CI used `actions/checkout@v4`/`setup-node@v4`, which run on
  deprecated node20; bumped to v5.

## [1.0.0] - 2026-08-20

### Added

- Initial release. Quality gate for AI-generated pull requests:
  - TODO / FIXME / XXX / HACK / WIP scan (added lines only)
  - Secret scan (AWS, GitHub, Google, OpenAI, Anthropic, Slack, Stripe,
    credentials, connection strings — redacted in reports)
  - Commit-hygiene check (conventional commits, empty subjects)
  - CI-status check (failing status checks / check runs on the head commit)
- Agent detection via label, branch prefix, or title; `gate-agents-only`
  default on so human PRs pass untouched.
- Check-run annotations at file:line + deduplicated report comment.
- `ignore-label` opt-out, `soft-fail` observe mode, example workflows.
