---
name: codex-guard
description: >-
  Pre-submit hygiene check for AI-agent-authored pull requests. Use this skill
  whenever you are about to open or update a pull request: it runs the
  codex-guard CLI locally, verifies the diff contains no leftover
  TODO/FIXME/XXX markers and no hardcoded secrets, checks that commit subjects
  follow conventional commits, and blocks submission until the checks pass or
  exceptions are documented in the PR description.
---

# codex-guard — self-check before you open a PR

You are about to open or update a pull request. Before submitting, run the same
hygiene checks that the codex-guard GitHub Action enforces in CI — locally,
on the working tree.

## 1. Find the CLI

- If this repository ships the codex-guard source, run it directly:
  `node src/cli.js`
- Otherwise, use `npx` (works once the package is published):
  `npx -y codex-guard`

## 2. Run the checks

- Scan uncommitted changes: `node src/cli.js --git --commits`
- Or scan a specific range: `node src/cli.js --git origin/main --commits`
- Exit code `0` means no blocking findings; `1` means blocking findings were
  found; `2` is a usage error.

## 3. Fix everything the CLI lists

- **TODO / FIXME / XXX / HACK / WIP markers**: remove them, or convert them to
  tracked issues and remove the code comments. Never leave "I'll handle this
  later" comments in a PR you submit.
- **Hardcoded secrets** (AWS/GitHub/OpenAI/Stripe keys, connection strings,
  passwords): remove them, rotate any that were shared, and use the repository's
  secret storage. A redacted match in the report still means the secret is in
  the diff — treat it as real.
- **Non-conventional commit subjects** (`WIP`, `fix stuff`, empty subjects):
  rewrite with conventional commits (`feat`, `fix`, `docs`, `chore`, ...).

## 4. Exceptions

If you deliberately keep something the CLI flags (for example a task-list
checkbox), state it explicitly in the PR description so a human reviewer can
confirm it is intentional. Do not silently resubmit a failing diff.

## 5. Then submit

Only open or update the PR after the checks exit `0` (or the exception is
documented in the description). This keeps the CI-side gate green and the
human review focused on real design questions.