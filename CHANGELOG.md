# Changelog

All notable changes to Codex Guard are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
