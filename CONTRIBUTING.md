# Contributing to Codex Guard

Thanks for considering a contribution — issues, PRs, and ideas are all welcome.

## Getting started

```bash
npm install
npm test      # node:test — no framework
npm run check # lint-level syntax check
```

We use the built-in `node:test` runner, so tests live in `test/*.test.js`
alongside a small `test/helpers.js` with fake `@actions/core`, octokit, and the
PR fixtures. There are no other test dependencies to install.

## Before you open a PR

1. Add/update tests that cover your change (unit tests for check logic, and if
   you touch orchestration, extend `test/main.test.js`).
2. Run `npm test` and `npm run check` — both must pass.
3. If you change an input, update **all three** to stay in sync: `action.yml`,
   the `DEFAULTS` block in `src/main.js`, and the input table in `README.md`.
   Config-file overrides reuse the same input names, so keep the README
   "Configuration file" section accurate too.
4. Update the roadmap checklist in `README.md` if your change completes an item.

## Publishing a release

This action is consumed from GitHub directly (`uses: Akimiya-z/codex-guard@v1`),
so the release tag is a big deal:

1. `npm ci` and **commit `node_modules`** — the action runs `node src/main.js`
   with no build step, so it must be self-contained in the repo.
2. Bump `version` in `package.json`.
3. Tag a semver release: GitHub Actions resolves `@v1` to the latest `v1.*`
   tag. Prefer `v1.x.y` tags explicitly (pin in your own workflows) and keep a
   moving `v1` tag updated for casual users.

## Code of conduct

Be kind, assume good intent, and keep review feedback constructive. That's it.
