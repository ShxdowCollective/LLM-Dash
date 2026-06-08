---
name: llm-dash-update
description: Use this skill to perform the daily LLM-Dash dashboard update. Research new LLM releases and benchmark updates (Exa preferred) since the last recorded changelog, apply a structured diff to data/dash.sqlite, write changelogs/YYYY-MM-DD.md with a required Run Metadata footer, and record run metadata (tokens, cost, duration, word count) in the run_metrics table + data/run_metrics.csv.
---

# LLM-Dash Daily Update

You are the update operator for LLM-Dash. Any AI agent (Claude, Codex, Gemini, or
another) can execute this, but the same contract applies to all of them.
Follow this skill end-to-end, no shortcuts.

## 0. Context

- Working directory: the repo root (parent of `skill/`).
- SQLite DB: `data/dash.sqlite`. Schema at `scripts/schema.sql`.
- Changelogs: `changelogs/YYYY-MM-DD.md`. **Append-only.** Never modify prior files.
- Run metrics: `run_metrics` table in SQLite + a human-readable mirror at
  `data/run_metrics.csv`.
- Scoring rubric: 0–10 normalized across `intelligence`, `coding`, `agents`,
  `speed`, `cost`. Never invent a score. Every score claim cites a URL in the
  prose.
- Architecture reference: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
  The frozen v1 plan at
  [../docs/plans/IMPLEMENTATION_PLAN.md](../docs/plans/IMPLEMENTATION_PLAN.md)
  is kept as a Phase 0–5 baseline only.

## 1. Preflight

1. Record the start wall-clock time in UTC ISO 8601. You need it for
   `duration_sec`.
2. Confirm tool availability:
   - **Exa** (preferred): search + content fetch. Use if `EXA_API_KEY` is set
     or an Exa MCP is available.
   - Fallback: your environment's web search + web fetch tools.
3. Confirm SQLite access (`sqlite3` CLI or a SQLite library).

## 2. Load current state

```sql
-- your "since" cutoff
SELECT value FROM meta WHERE key = 'last_updated';

-- currently tracked models with their most recent scores
SELECT * FROM v_models_latest;

-- recent changelog context so you don't repeat yourself
SELECT date, title, summary, new_models_json
FROM changelogs ORDER BY date DESC LIMIT 5;
```

## 3. Research

Goal: find every newsworthy LLM release and benchmark update since
`last_updated`.

### Query bundle (tune to the day)

- `"LLM release" OR "AI model launch" AFTER:{since}`
- `"SWE-bench" OR "SWE-Pro" AFTER:{since}`
- `"GPQA Diamond" OR "Artificial Analysis Intelligence Index" AFTER:{since}`
- `"Terminal-Bench" OR "OSWorld" OR "PinchBench" OR "ClawEval" AFTER:{since}`
- Per-vendor sweep: OpenAI, Anthropic, Google DeepMind, Alibaba (Qwen),
  MiniMax, NVIDIA, xAI, Zhipu (GLM), Moonshot (Kimi), Xiaomi, Meta (Llama),
  DeepSeek, Mistral, Cohere — plus any newcomers you spot.
- For each **currently tracked** model: one query for fresh benchmark numbers
  or deprecation news.

### Fetch the content

For the top ~20 results across queries, pull full text. Skip paywalls. Skip
aggregators citing themselves.

### LLM Stats enrichment (optional)

If an LLM Stats API key is configured, the update runner injects recent model
catalog and update data from LLM Stats into your prompt as supplementary
context. Use this data for discovery (new model releases you might otherwise
miss), cross-referencing metadata (pricing, parameter counts, release dates),
and benchmark score context. Prefer primary sources for final scoring — every
dashboard score still needs a URL citation in the changelog prose.

### Triage

- Prefer primary sources: vendor announcements, model cards, papers, benchmark
  maintainers' pages.
- Discard rumor / leak / unconfirmed-by-vendor claims.
- If the net result is "no updates": still proceed. You'll emit a "no updates"
  changelog, logged metrics, and nothing else.

## 4. Produce the diff

Build this JSON in memory. Do not hallucinate any field.

```json
{
  "date": "YYYY-MM-DD",
  "title": "Month DD, YYYY",
  "summary": "1-2 sentence blurb for the index page.",
  "new_models": [
    {
      "name": "Claude Opus 4.7",
      "vendor": "Anthropic",
      "color": "#d4a27f",
      "released": "Apr 16, 2026",
      "params": "Proprietary",
      "pricing": "$5.00 / $25.00",
      "intelligence": 9.4,
      "coding": 9.7,
      "agents": 9.5,
      "speed": 5.0,
      "cost": 3.5,
      "notes": "... prose with inline citations ...",
      "card_url": "https://docs.anthropic.com/en/docs/about-claude/models/overview"
    }
  ],
  "score_updates": [
    {
      "name": "Claude Opus 4.6",
      "field": "intelligence",
      "old": 9.4,
      "new": 9.3,
      "source_url": "https://..."
    }
  ],
  "status_changes": [
    { "name": "Claude Opus 4.6", "from": "active", "to": "superseded",
      "reason": "Replaced by Opus 4.7." }
  ],
  "changelog_markdown": "# Changelog — Month DD, YYYY\n\n## New Models\n\n### Claude Opus 4.7\n..."
}
```

Rules:
- `color`: reuse the vendor's existing color if they're already tracked;
  pick a fresh hex for a new vendor and document it in `notes`.
- `card_url`: the official model card or vendor docs page for this model — you
  are already reading it as a primary source, so record its URL. Prefer the
  exact per-model card; fall back to the vendor's official models/docs page.
  Optional but strongly preferred; omitting it leaves the dashboard with a
  generic web-search lookup link instead of the real card.
- All five scores ∈ [0.0, 10.0]. The schema enforces this with CHECK
  constraints (`schema_version` 2); a write outside the range will fail the
  transaction.
- `changelog_markdown` is the **body** of the `.md` (no frontmatter — that's
  step 6; no Run Metadata footer — that's step 6 too).

## 5. Apply the diff to SQLite

Single transaction. All writes succeed together or not at all.

```sql
BEGIN;

-- Upsert each new_models entry
INSERT INTO models (name, vendor, color, released, params, pricing, notes, first_seen, last_seen)
VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), date('now'))
ON CONFLICT(name) DO UPDATE SET
  vendor    = excluded.vendor,
  color     = excluded.color,
  released  = excluded.released,
  params    = excluded.params,
  pricing   = excluded.pricing,
  notes     = excluded.notes,
  last_seen = date('now');

-- Insert (or replace) a score row per (model, date) for every new_models entry
-- AND every score_updates entry.
INSERT INTO model_scores (model_id, as_of, intelligence, coding, agents, speed, cost, source_notes)
SELECT id, ?, ?, ?, ?, ?, ?, ?
FROM models WHERE name = ?
ON CONFLICT(model_id, as_of) DO UPDATE SET
  intelligence = excluded.intelligence,
  coding       = excluded.coding,
  agents       = excluded.agents,
  speed        = excluded.speed,
  cost         = excluded.cost,
  source_notes = excluded.source_notes;

-- Status changes
UPDATE models SET status = ? WHERE name = ?;

-- Changelog index row
INSERT INTO changelogs (date, title, path, summary, new_models_json, changed_json)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(date) DO UPDATE SET
  title           = excluded.title,
  path            = excluded.path,
  summary         = excluded.summary,
  new_models_json = excluded.new_models_json,
  changed_json    = excluded.changed_json;

COMMIT;
```

## 6. Write the changelog file

Path: `changelogs/YYYY-MM-DD.md` (same date as above).

```md
---
date: 2026-04-20
generated_at: 2026-04-20T09:02:14Z
agent: claude-opus-4-7
agent_runtime: claude-code
new_models: ["Claude Opus 4.7", "Qwen3.6-35B-A3B"]
changes:
  - { model: "Claude Opus 4.6", field: "status", from: "active", to: "superseded" }
  - { model: "Claude Opus 4.6", field: "intelligence", from: 9.4, to: 9.3 }
---

# Changelog — April 20, 2026

<!-- body from step 4's changelog_markdown: new models, score changes, status
     changes, with citation links inline. -->

---

## Run Metadata

| metric | value |
|---|---|
| agent | claude-opus-4-7 |
| agent_runtime | claude-code |
| started_at | 2026-04-20T09:00:03Z |
| completed_at | 2026-04-20T09:02:47Z |
| duration_sec | 164 |
| input_tokens | 42318 |
| output_tokens | 3912 |
| cached_tokens | 38100 |
| cost_usd | 0.28 |
| exa_searches | 8 |
| exa_fetches | 12 |
| word_count | 1247 |
```

Rules:
- **The `## Run Metadata` footer is required.** The Stats dashboard page joins
  `run_metrics` to changelog content; a missing footer will read as a broken
  run.
- `word_count` is of the body only (between frontmatter and the `## Run
  Metadata` heading).
- **Plain-language prose.** The changelog body is read in the dashboard by real
  people. Write in plain product language — no raw repo paths or filenames
  (e.g. `references/foo.jsx`), no internal/debug slugs, no design-system jargon.
  Cite sources as readable link text, not bare file paths.
- Use `NULL` (or leave blank) when a value is genuinely unknowable — e.g.
  `cost_usd` if your SDK doesn't expose pricing. Prefer accurate nulls to
  guesses.
- Identify yourself honestly. `agent` is the specific model
  (`claude-opus-4-7`, `gpt-5-4`, `gemini-3-pro`, `qwen3-6-plus`, …).
  `agent_runtime` is the legacy metadata field for the CLI/SDK harness
  (`claude-code`, `codex-cli`, `gemini-cli`, `cline`, `openai-agents`, …).

## 7. Record run metrics to SQLite

```sql
INSERT INTO run_metrics (
  changelog_date, started_at, completed_at, duration_sec,
  agent_name, agent_runtime,
  tokens_input, tokens_output, tokens_cached,
  cost_usd, exa_searches, exa_fetches,
  word_count, notes
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(changelog_date) DO UPDATE SET
  started_at    = excluded.started_at,
  completed_at  = excluded.completed_at,
  duration_sec  = excluded.duration_sec,
  agent_name    = excluded.agent_name,
  agent_runtime = excluded.agent_runtime,
  tokens_input  = excluded.tokens_input,
  tokens_output = excluded.tokens_output,
  tokens_cached = excluded.tokens_cached,
  cost_usd      = excluded.cost_usd,
  exa_searches  = excluded.exa_searches,
  exa_fetches   = excluded.exa_fetches,
  word_count    = excluded.word_count,
  notes         = excluded.notes;
```

## 8. Regenerate data/run_metrics.csv

Easiest: run `python scripts/export_metrics_csv.py`.

Equivalent via sqlite3 CLI:

```bash
sqlite3 -header -csv data/dash.sqlite \
  "SELECT * FROM run_metrics ORDER BY changelog_date;" \
  > data/run_metrics.csv
```

## 9. Bump meta.last_updated

```sql
INSERT INTO meta (key, value) VALUES ('last_updated', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
```

## 10. Self-verification (don't skip)

- [ ] `changelogs/YYYY-MM-DD.md` exists, has YAML frontmatter, and ends with
      `## Run Metadata`.
- [ ] `changelogs` table has a row for today.
- [ ] `run_metrics` table has a row for today.
- [ ] `data/run_metrics.csv` contains a matching row.
- [ ] `meta.last_updated` is today's datetime.
- [ ] Every score claim in the `.md` has a citation URL in the prose.
- [ ] No prior changelog `.md` file was modified.

## Agent-specific token & cost capture

Where to pull `tokens_*` and `cost_usd` from:

- **Claude / Anthropic SDK:** `message.usage` →
  - `tokens_input`  = `input_tokens + cache_creation_input_tokens`
  - `tokens_cached` = `cache_read_input_tokens`
  - `tokens_output` = `output_tokens`
  - `cost_usd`      = compute from current model pricing
    (per-million-token rates from the vendor's pricing page).
- **Claude Code CLI:** `/cost` prints the totals for the session.
- **Codex / OpenAI SDK:** `response.usage.prompt_tokens`,
  `completion_tokens`, `prompt_tokens_details.cached_tokens` (where exposed).
- **Gemini / Google SDK:** `response.usage_metadata.prompt_token_count`,
  `candidates_token_count`, `cached_content_token_count`.
- **Anything else:** do your best. `NULL` is acceptable for genuinely
  unknown fields — but always fill `duration_sec`.

Exa metrics:
- `exa_searches` = distinct search calls.
- `exa_fetches`  = distinct content fetch calls.
- If you used the web-search fallback instead, set both to `0` and note that
  in the `notes` column.

## Hard don'ts

- **Don't invent scores.** Every score change needs a URL citation.
- **Don't delete or edit prior changelog files.** The audit trail is
  load-bearing.
- **Don't modify old `model_scores` rows.** Append-only.
- **Don't skip the metadata step.** A run without a `run_metrics` row is
  a broken run — rerun the whole skill if you realize you missed it.
- **Don't widen scope.** If the user asks for something unrelated during an
  update, finish the update first, then deal with the unrelated request.

## How runs get kicked off (for humans)

Interactive: the dashboard's **Refresh** button copies a ready-to-paste prompt
to the clipboard. Click **Open Terminal** to launch a terminal scoped to the
repo, then in your agent CLI:

```bash
claude "$(pbpaste)"          # macOS, or use Get-Clipboard on Windows PowerShell
# or
codex  "<paste>"
# or
gemini "<paste>"
```

Scheduled: an OS-level scheduled job (systemd timer on Linux/WSL, launchd on
macOS, Task Scheduler on Windows) installed from Settings runs
`scripts/run_update.py` at the configured cadence with the same prompt.
