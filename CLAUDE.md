# LLM-Dash — Update Agent Instructions

Local LLM benchmark dashboard with AI-driven daily changelog updates.

**This file is the contract for agents running the daily data update.** If you
were asked to refresh benchmarks, research models, or produce a changelog,
follow **[skill/SKILL.md](skill/SKILL.md)** end-to-end — no shortcuts, no partial
runs. SKILL.md is the source of truth; everything below is a quick reference for
that task.

> Doing feature work, UI changes, or other development instead? This file does
> not govern that — follow the request, [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md),
> and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The rules below are scoped to
> an update run, not a blanket prohibition on changing the codebase.

## Entrypoints

| What you need | Where to look |
|---|---|
| Update procedure (**source of truth**) | [skill/SKILL.md](skill/SKILL.md) |
| Quick start & project overview | [README.md](README.md) |
| System architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development & code conventions | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Usage (install, modes, troubleshooting) | [docs/USAGE.md](docs/USAGE.md) |

## Triggers — "follow SKILL.md"

Any of these mean run the update via [skill/SKILL.md](skill/SKILL.md):

- "update the dashboard" / "refresh" / "run the daily update"
- "produce today's changelog"
- "research new models" / "check for LLM news"
- the scheduled `/schedule` trigger that fires daily

## Update-Run Rules

### Data Integrity

- **No invented benchmark scores.** Every score claim cites a URL.
- **Changelogs are append-only.** Never modify or delete prior `changelogs/*.md` files.
- **Dual metadata.** Every run records metrics in **both** the `## Run Metadata`
  footer of the `.md` file **and** the `run_metrics` SQLite table. Skipping
  either is a broken run.
- **Run accounting.** Every run writes a new `changelogs/YYYY-MM-DD.md`, inserts
  a `run_metrics` row, regenerates `data/run_metrics.csv`, and bumps
  `meta.last_updated`.

### Token & Cost Logging

Every run records tokens and duration. Record `cost_usd` when your CLI/runtime
harness exposes it (Claude Code `/cost`, or compute from `message.usage` +
per-model pricing). No budget cap — everything is logged so regressions are
obvious on the Stats page.

### Stay In Your Lane (during an update)

A data refresh touches data, not the app. While running the update:

- **Don't edit the web app** (`web/`) as part of a refresh — a changelog run has
  no reason to. Frontend changes are separate development work.
- **Don't modify old changelog files.** Today's date owns today's file.
- **Don't modify old `model_scores` rows.** Score history is append-only.

## Agent Identity

When writing changelog frontmatter and `run_metrics` rows, identify yourself:

| Field | Example |
|---|---|
| `agent` | `claude-opus-4-8`, `claude-sonnet-4-6` |
| `agent_runtime` | `claude-code` |

Don't spoof. The Stats page displays these for per-agent analytics.
