# Dashboard Update Run Guide

Use this document only for daily/model benchmark update runs. For normal
development work, follow [AGENTS.md](../AGENTS.md).

## Source of Truth

**Follow [skill/SKILL.md](../skill/SKILL.md) end-to-end.** It is the single
source of truth for benchmark update runs. Every agent running an update reads
it, follows it, tracks its own token/cost/duration metadata, and finishes with
the verification checklist in section 10.

## Triggers

- A clipboard-pasted prompt from the dashboard's **Refresh** button.
- An OS-level scheduled job firing at the configured cadence.
- Manual invocation: `claude "follow skill/SKILL.md"` or your CLI's
  equivalent.

## Optional Enrichment

If an LLM Stats API key is configured (Settings > Research, or set via the
setup wizard), the runner injects recent model-catalog and update data from
LLM Stats into the agent prompt as supplementary context. Use it for
discovery and metadata cross-referencing only — every score claim still needs
a primary-source URL citation. To verify enrichment ran on a given update,
check that row's `run_metrics.notes` for `llmstats_enriched=true`.

## Non-Negotiables

- **Every score claim cites a URL.** No invented numbers, no hallucinated
  benchmarks.
- **Prior `changelogs/*.md` files are never modified or deleted.** The audit
  trail is load-bearing.
- **Dual metadata.** Every run records metrics in the `## Run Metadata` footer
  of the `.md` and the `run_metrics` SQLite table. Skipping either is a broken
  run.
- **Full accounting.** Every run writes a new `changelogs/YYYY-MM-DD.md`,
  inserts a `run_metrics` row, regenerates `data/run_metrics.csv`, and bumps
  `meta.last_updated`.
- **Frontend is read-only during update runs.** Do not touch `web/`; data
  changes come only from update runs and seed scripts.
- **Stay in update scope.** If the user asks for unrelated development work
  during an update, finish the update first, then handle the other request.

## Metrics to Track

| Field | Required | Notes |
|---|---|---|
| `duration_sec` | Always | Wall-clock seconds from start to finish |
| `tokens_input` | When available | Include cache creation tokens |
| `tokens_output` | When available | |
| `tokens_cached` | When available | Cache read tokens |
| `cost_usd` | When available | Compute from model pricing if not exposed |
| `exa_searches` | Always | `0` if using web-search fallback |
| `exa_fetches` | Always | `0` if using web-search fallback |
| `word_count` | Always | Body word count between frontmatter and Run Metadata |

Use `NULL` for genuinely unknowable fields. Prefer accurate nulls to guesses.

## Agent Identity

When writing changelog frontmatter and `run_metrics` rows, identify yourself
honestly:

| Field | Example Values |
|---|---|
| `agent` | `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5-4`, `gemini-3-pro`, `qwen3-6-plus` |
| `agent_runtime` | `claude-code`, `codex-cli`, `gemini-cli`, `cline`, `cursor`, `openai-agents` |

`agent` is the specific model. `agent_runtime` is the CLI or SDK harness. The
Stats dashboard groups by both. Do not spoof.

## Update Boundaries

- Do not touch the static web app (`web/`) during update runs.
- Do not modify old changelog files. Today's date owns today's file.
- Do not modify old `model_scores` rows. Score history is append-only.
- Do not widen scope during an update run.
