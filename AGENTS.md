# LLM-Dash — Agent Guide

Local LLM benchmark dashboard with AI-driven daily changelog updates.
Applies to any AI coding agent — Claude Code, Codex, Gemini CLI, Cline,
Continue, Cursor, etc.

- Project layout: [README.md](README.md)
- Architecture: [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md)

## Primary task: update the dashboard

**Follow [skill/SKILL.md](skill/SKILL.md) end-to-end.** That file is the
single source of truth. Every agent running an update reads it, follows it,
records its own tokens / cost / duration / word_count, and finishes with the
verification checklist in §10.

## Triggers

- A clipboard-pasted prompt from the dashboard's **Refresh** button.
- A Claude Code `/schedule` trigger firing daily.
- Manual invocation: `claude "follow skill/SKILL.md"` or your CLI's
  equivalent.

## Non-negotiables

- Every score claim cites a URL. No invented numbers.
- Prior `changelogs/*.md` files are never modified or deleted.
- Every run appends a new changelog, a new `run_metrics` row, refreshes
  `data/run_metrics.csv`, and bumps `meta.last_updated`.
- Track and log: `tokens_input`, `tokens_output`, `tokens_cached`,
  `cost_usd` (if known), `duration_sec`, `exa_searches`, `exa_fetches`,
  `word_count`. `NULL` is acceptable for genuinely unknowable fields; always
  fill `duration_sec`.

## Agent identity

When writing the changelog frontmatter and the `run_metrics` row, identify
yourself honestly:

| field | value examples |
|---|---|
| `agent` | `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5-4`, `gemini-3-pro`, `qwen3-6-plus` |
| `agent_runtime` | `claude-code`, `codex-cli`, `gemini-cli`, `cline`, `cursor`, `openai-agents` |

The Stats dashboard shows this as agent + Agent Provider. `agent_runtime` is
the legacy storage/frontmatter field for the CLI or SDK harness. Don't spoof.
