# LLM-Dash — Agent Guide

Universal instructions for any AI coding agent working on this repository.
Applies to Claude Code, Codex, Gemini CLI, Cline, Continue, Cursor, and any
other agent runtime.

## Entrypoints

| What you need | Where to look |
|---|---|
| Quick start & project overview | [README.md](README.md) |
| System architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development & code conventions | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Implementation history | [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md) |
| Update procedure (**source of truth**) | [skill/SKILL.md](skill/SKILL.md) |

## Primary Task — Update the Dashboard

**Follow [skill/SKILL.md](skill/SKILL.md) end-to-end.** It is the single
source of truth for daily benchmark updates. Every agent running an update
reads it, follows it, tracks its own token/cost/duration metadata, and
finishes with the verification checklist in §10.

## Triggers

- A clipboard-pasted prompt from the dashboard's **Refresh** button.
- An OS-level scheduled job firing at the configured cadence.
- Manual invocation: `claude "follow skill/SKILL.md"` or your CLI's equivalent.

## Non-Negotiables

- **Every score claim cites a URL.** No invented numbers, no hallucinated
  benchmarks.
- **Prior `changelogs/*.md` files are never modified or deleted.** The audit
  trail is load-bearing.
- **Dual metadata.** Every run records metrics in the `## Run Metadata` footer
  of the `.md` **and** the `run_metrics` SQLite table. Skipping either is a
  broken run.
- **Full accounting.** Every run writes a new `changelogs/YYYY-MM-DD.md`,
  inserts a `run_metrics` row, regenerates `data/run_metrics.csv`, and bumps
  `meta.last_updated`.

### Metrics to Track

| Field | Required | Notes |
|---|---|---|
| `duration_sec` | **Always** | Wall-clock seconds from start to finish |
| `tokens_input` | When available | Include cache creation tokens |
| `tokens_output` | When available | |
| `tokens_cached` | When available | Cache read tokens |
| `cost_usd` | When available | Compute from model pricing if not exposed |
| `exa_searches` | Always | `0` if using web-search fallback |
| `exa_fetches` | Always | `0` if using web-search fallback |
| `word_count` | Always | Body word count (between frontmatter and Run Metadata) |

Use `NULL` for genuinely unknowable fields. Prefer accurate nulls to guesses.

## Agent Identity

When writing changelog frontmatter and `run_metrics` rows, identify yourself
honestly:

| Field | Example Values |
|---|---|
| `agent` | `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5-4`, `gemini-3-pro`, `qwen3-6-plus` |
| `agent_runtime` | `claude-code`, `codex-cli`, `gemini-cli`, `cline`, `cursor`, `openai-agents` |

`agent` is the specific model. `agent_runtime` is the CLI or SDK harness. The
Stats dashboard groups by both. Don't spoof.

## Boundaries

- **Don't touch the static web app** (`web/`). The frontend is read-only;
  data changes come only from update runs and seed scripts.
- **Don't modify old changelog files.** Today's date owns today's file.
- **Don't modify old `model_scores` rows.** Score history is append-only.
- **Don't widen scope.** If the user asks for something unrelated during an
  update, finish the update first, then handle the other request.
