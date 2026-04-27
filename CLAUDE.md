# LLM-Dash — instructions for Claude

Local LLM benchmark dashboard with AI-driven daily changelog updates.

## What this file is for

You are here when Claude is driving this repo. Use it as the entrypoint for every
update run.

- Project layout and quick start: [README.md](README.md)
- Architecture and design decisions: [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md)

## The one thing you will usually be asked to do

**Update the dashboard.** Follow this file's contract exactly:
`[skill/SKILL.md](skill/SKILL.md)`.

Triggers that mean "follow SKILL.md":
- "update the dashboard" / "refresh" / "run the daily update"
- "produce today's changelog"
- "research new models" / "check for LLM news"
- the scheduled `/schedule` trigger that fires once a day

## Rules of engagement

- **No invented benchmark scores.** Every score claim cites a URL.
- **Do not delete or rewrite prior `changelogs/*.md` files.** Audit trail is
  load-bearing.
- Every run writes a new `changelogs/YYYY-MM-DD.md`, inserts a `run_metrics`
  row, regenerates `data/run_metrics.csv`, and bumps `meta.last_updated`.
- Every run records tokens and duration. Record `cost_usd` when your CLI/runtime
  harness exposes it (Claude Code `/cost`, or compute from `message.usage` +
  per-model pricing). **No budget cap** — but everything is logged so
  regressions are obvious on the Stats page.
- Metadata goes **both** in the `## Run Metadata` footer of the `.md` **and**
  the `run_metrics` SQLite table. Skipping either is a broken run.

## What you won't touch

- The static web app (`web/`). The frontend is read-only.
- Old changelog files. Today's date owns today's file.
- `model_scores` rows for dates other than today.
