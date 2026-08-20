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

- [ ] Record a ~15s demo GIF (`docs/` has instructions) and swap it in
- [ ] Squash-merge the Dependabot dependency PRs you trust (or close them)
- [ ] Star your own repo (petty, but it makes the count non-zero and looks
      decent in screenshots — clone, star from a secondary account if you have one)
- [ ] Post Show HN first (hardest to repeat later), then r/programming ~2h later,
      then X; stagger so each gets its own window
- [ ] Ask the community for the ONE most-wanted check and ship it within a week
- [ ] Add the badge back to the README once CI is green on main

## Where to find your audience

- r/codex, r/ClaudeAI, r/copilot (agent-specific subs)
- The "awesome" lists for GitHub Actions and AI coding agents
- Aider / Cline / Continue communities (same hygiene pain, different agent)
- Product Hunt (long tail, low effort) — later, after the anchor posts
