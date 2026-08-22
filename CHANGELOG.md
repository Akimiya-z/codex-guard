# Changelog

All notable changes to Codex Guard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
