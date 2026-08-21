# Changelog

All notable changes to Codex Guard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
