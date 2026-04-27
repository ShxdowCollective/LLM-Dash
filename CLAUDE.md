# LLM-Dash — Claude Agent Instructions

Local LLM benchmark dashboard with AI-driven daily changelog updates.

## Entrypoints

| What you need | Where to look |
|---|---|
| Quick start & project overview | [README.md](README.md) |
| System architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development & code conventions | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Implementation history | [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md) |
| Update procedure (**source of truth**) | [skill/SKILL.md](skill/SKILL.md) |

## Primary Task — Update the Dashboard

When asked to update, follow **[skill/SKILL.md](skill/SKILL.md)** end-to-end.
No shortcuts, no partial runs.

### Triggers

Any of these mean "follow SKILL.md":

- "update the dashboard" / "refresh" / "run the daily update"
- "produce today's changelog"
- "research new models" / "check for LLM news"
- the scheduled `/schedule` trigger that fires daily

## Rules

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

### Boundaries

- **Don't touch the static web app** (`web/`). The frontend is read-only.
- **Don't modify old changelog files.** Today's date owns today's file.
- **Don't modify old `model_scores` rows.** Score history is append-only.

## Agent Identity

When writing changelog frontmatter and `run_metrics` rows, identify yourself:

| Field | Example |
|---|---|
| `agent` | `claude-opus-4-7`, `claude-sonnet-4-6` |
| `agent_runtime` | `claude-code` |

Don't spoof. The Stats page displays these for per-agent analytics.
