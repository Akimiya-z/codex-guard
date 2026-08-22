# Launch material

Drafts you can adapt the day you publish. The single biggest lever for stars on
a repo like this is the **first 48 hours** — pick one anchor post (Show HN or
r/programming) and post the others around it.

Repo: <https://github.com/Akimiya-z/codex-guard>
Live dogfood evidence: PR #6 (failing) and the repo's own gated merge history.

---

## Show HN (best anchors-worthy)

**Title:** Show HN: I made a GitHub Action that gatekeeps AI-generated PRs

**Body:**

> tl;dr — a zero-config GitHub Action that only inspects pull requests that
> look *agent-written* and blocks them on TODO leftovers, hardcoded secrets,
> sloppy commits, or red CI. It's gating this repo's own AI PRs right now.
>
> <https://github.com/Akimiya-z/codex-guard>
>
> **Why:** agents write a lot of code and clean up almost none of it. Around
> half the agent-authored PRs I review have the same four problems:
> `// TODO:` that was never meant to stay, a credential pasted from a chat
> transcript, a commit trail of `WIP`/`fix stuff`, and a "green" PR sitting on
> a red CI commit. A human shouldn't be the gatekeeper for those.
>
> **What it does:**
>
> - Detects agent PRs by label (`codex-generated`), branch prefix (`codex/`),
>   or title — humans pass untouched by default.
> - Scans only *added* lines for TODO/FIXME/XXX markers.
> - Redacts and flags AWS/GitHub/OpenAI/Anthropic/Stripe keys, connection
>   strings, hardcoded credentials.
> - Enforces conventional commits and fails on failing CI for the head commit.
> - Reports every finding as a file/line check-run annotation + a summary comment.
>
> **Proof:** it's dogfooding this repo — [PR #6](https://github.com/Akimiya-z/codex-guard/pull/6) shows a deliberately
> messy `codex/` PR getting blocked with all four findings, and the merge
> history shows clean ones passing.
>
> One honest caveat: secret scanning is regex-based, intentionally — it's the
> cheap 80%, not a replacement for gitleaks.
>
> Would love feedback on which checks people actually want enforced vs.
> informational. The action is Node 24, zero build step, MIT.

---

## r/programming (text post)

**Title:** Codex Guard — a GitHub Action that blocks TODO leftovers, leaked
secrets and sloppy commit trails on AI-generated PRs

**Body:**

> Codex, Claude Code and Copilot are great at writing code and bad at cleaning
> up. Agent PRs consistently arrive with the same problems: `TODO` comments
> nobody deleted, hardcoded credentials, commit trails like
> `WIP → fix stuff → more changes`, and CI that's red on the head commit.
>
> I'd rather spend review time on design than on "please remove the TODO".
> So I built a small GitHub Action that only inspects PRs that look
> agent-written (label / branch prefix / title) and fails them on those
> four things, with file/line annotations and a summary comment.
>
> It runs on this repo too — see PR #6 for a real failing example.
> <https://github.com/Akimiya-z/codex-guard>
>
> Happy to hear what checks you'd add — the obvious next one is a config file
> for per-repo policy.

---

## X thread

1. Agents generate PRs faster than humans can babysit them. The gap isn't
   writing — it's the cleanup. TODO leftovers, pasted keys, `WIP` commit
   trails, red CI on "green" PRs.
2. So I built a GitHub Action that only looks at agent-written PRs and
   blocks them on those four things. File/line annotations + a summary
   comment. No build step, Node 24, MIT.
3. It dogfoods itself — this repo's own `codex/` PRs are gated right now.
   Messy PR? Blocked. Clean PR? Merged. Filter by workflow in the Actions tab
   to see it live.
4. <https://github.com/Akimiya-z/codex-guard> — the 80% solution to agent hygiene,
   open to your worst PR as a test case.

---

## Checklist for launch day

- [x] Repo starred (done)
- [x] v1.1.0 announcement release live
- [ ] Record a ~15s demo GIF (local machine) and attach it to the Show HN / X posts
- [ ] Squash-merge the Dependabot dependency PRs you trust (or close them)
- [ ] Post Show HN first (hardest to repeat later), then r/programming ~2h later,
      then X; stagger so each gets its own window
- [ ] Ask the community for the ONE most-wanted check and ship it within a week
- [ ] After ~14 days (≈ Sep 4, 2026) or at ≥100 stars, submit to
      awesome-claude-code via its web form (human-only)

## Where to find your audience

- r/codex, r/ClaudeAI, r/copilot (agent-specific subs)
- The "awesome" lists for GitHub Actions and AI coding agents
- Aider / Cline / Continue communities (same hygiene pain, different agent)
- Product Hunt (long tail, low effort) — later, after the anchor posts

---

## Status & what still needs a human (updated at launch-prep)

**Already published:**

- [x] Repo public, v1.0.0 + v1.1.0 releases, `v1` shortcut tag. v1.1.0 release
      is a full launch announcement (node24, dogfood proof, quick start).
- [x] README carries the dogfood proof (verbatim output of PR #6) and the
      "this repo gates its own AI PRs" banner.
- [x] Repo starred (HTTP 204), topics + description set.

**Community posts (Show HN / Reddit / X) — needs YOUR browser login.** The
automation environment has no session on those sites and no way to obtain your
credentials, so these cannot be posted programmatically. You can fire them in
~2 minutes with the drafts above:

1. Open <https://news.ycombinator.com/submit> (logged in from your browser).
2. Title + body come from the **Show HN** section of this file; use
   `github.com/Akimiya-z/codex-guard` as the URL — the body then just needs the
   first two lines (or skip the URL and paste the full body).
3. Reddit: r/programming text post from the section above; r/codex +
   r/ClaudeAI + r/copilot links get the same one-liner.
4. X: the thread above, one post at a time, ~1-2h apart.

**awesome-claude-code (5.2k★-adjacent, 52k★, active):** not eligible yet — its
CONTRIBUTING requires the repo to be **≥14 days old with ongoing commits, OR
≥100 stars**, and submissions are **human-only via the web issue form** (CLI
submissions are rejected). Revisit after the repo turns 14 days old
(≈ Sep 4, 2026) or hits 100 stars. Draft one-line description (no sales pitch,
no emoji, one line):

> A GitHub Action that only inspects agent-written pull requests and fails them
> on TODO leftovers, hardcoded secrets, non-conventional commits, and failing CI

**sdras/awesome-actions:** deprioritize — last updated 2024-09 (stale), so an
entry there gets little traffic and may sit unmerged.

**Demo GIF:** no GIF tooling (ffmpeg etc.) is available in this environment;
record one locally for the launch thread using the flow in `docs/`.

---

## Publishing to GitHub Marketplace (web UI — verified flow, 2026)

GitHub's current flow (from docs.github.com "Publishing actions in GitHub
Marketplace"). The repo already meets the prerequisites (public, `action.yml`
at root, unique `name`). No manual review — it goes live immediately.

1. Log in, open the repository, open `action.yml`, and click the
   **"Draft a release"** banner.
2. First time: accept the **Marketplace Developer Agreement** (the page sends
   you to it; until accepted, the publish checkbox is greyed out).
3. Under **Release Action**, tick **"Publish this Action to the GitHub
   Marketplace"**. Fix any metadata warnings until it shows
   "Everything looks good!".
4. Pick the **Primary Category**: `Code review`; Secondary:
   `Continuous integration` (or `Security`).
5. Enter the version tag (e.g. `v1.5.0`), title and notes, then
   **Publish release** (requires 2FA).
6. Future releases: releases created via `gh release create`/API do **not**
   tick the marketplace box — either draft the release from the action.yml
   banner, or edit each release and re-tick the box.

Result: `github.com/marketplace?type=actions&query=codex-guard` shows an
**Install / Use** button, full README, and release history.

---

## Publishing to npm (owner login — verified ready)

Name `codex-guard` is **free** on npm (checked 2026-08-22). The 1.7.0 tarball
is verified: CLI runs from the installed package, SKILL.md + action.yml included.

1. Create/login your npm account: <https://www.npmjs.com/signup> (verify email),
   or `npm login` in a terminal. npm requires **2FA** for publishing.
2. From the repo root run:
   ```bash
   npm publish   # prepublishOnly auto-runs tests + syntax checks
   ```
3. Verify anywhere:
   ```bash
   npx -y codex-guard --help
   ```
4. Result page: <https://www.npmjs.com/package/codex-guard>

Notes:

- A published version can **never be overwritten** (unpublish only ≤72h and only
  with zero dependents) — publish a version you're happy with; publish the next
  fix as a new version.
- Unscoped names are public by default; no `--access` flag needed.
- The agent skill's `npx -y codex-guard` instruction becomes real once this
  exists — post about it in the launch threads.
