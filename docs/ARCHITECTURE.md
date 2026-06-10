# LLM-Dash — Architecture

> System design reference for developers. For contributor setup and workflow,
> see [DEVELOPMENT.md](DEVELOPMENT.md). For the full build history, see
> [plans/IMPLEMENTATION_PLAN.md](plans/IMPLEMENTATION_PLAN.md).

---

## System Overview

LLM-Dash is a local-first dashboard for tracking LLM benchmark scores and
daily changelogs. It separates **writing** (AI agent update runs) from
**reading** (the browser-based dashboard) through a shared SQLite database.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Writer Layer — AI Agent                                            │
│  Any agent (Claude, Codex, Gemini, …) reads skill/SKILL.md and     │
│  executes the update contract.                                      │
│                                                                     │
│  Trigger paths:                                                     │
│   • Dashboard Refresh → Agent Provider (OpenAI Agents SDK)          │
│   • Dashboard Refresh → clipboard prompt → manual CLI agent         │
│   • OS scheduled job → scripts/run_update.py                        │
│   • Direct invocation: claude "follow skill/SKILL.md"               │
│                                                                     │
│  Write targets:                                                     │
│   1. data/dash.sqlite (models, scores, changelogs, run_metrics)     │
│   2. changelogs/YYYY-MM-DD.md (human-readable artifact)             │
│   3. data/run_metrics.csv (regenerated mirror)                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ writes to disk
                            ▼
          ┌──────────────────────────────────┐
          │  Shared Data Layer               │
          │  data/dash.sqlite                │
          │  data/run_metrics.csv            │
          │  changelogs/*.md                 │
          └──────────────┬───────────────────┘
                         │ reads from disk
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Reader Layer — Dashboard                                           │
│                                                                     │
│  FastAPI server (server.py)                                         │
│   • Serves web/ as static files                                     │
│   • Mounts /data and /changelogs for direct fetch                   │
│   • API routes: /api/prompt, /api/provider, /api/run-update, etc.   │
│                                                                     │
│  Browser app (web/)                                                 │
│   • sql.js loads dash.sqlite into WASM-SQLite                       │
│   • App areas: Models, Changelog, Stats, Settings                   │
│   • Complex filtering via parameterized SQL                         │
│   • Offline-capable once loaded                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Writer and reader are fully decoupled. Killing the server doesn't affect an
in-progress update. Killing the agent doesn't affect the dashboard.

---

## Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla HTML / CSS / JS | Zero-build constraint; no npm at runtime |
| SQL in browser | sql.js (SQLite-WASM) | Real SQL for complex filtering without a server round-trip |
| Markdown rendering | marked.js | Tiny, single-file, zero dependencies |
| Charts | SVG + CSS mini-bars | SVG powers the model scatter/radar surface; lightweight CSS bars summarize run telemetry |
| Local server | FastAPI + uvicorn | Needed for API routes; bare `http.server` can't do `/api/*` |
| Agent execution | OpenAI Agents SDK | BYOK-compatible; runs against any OpenAI-compatible endpoint |
| Research | Exa (preferred) | Structured search + content fetch with citation control |
| Credential storage | Env → Voidware provider credential → Voidware app broker → legacy keyring | Secrets stay outside repo/API responses; selected provider credentials use broker grants with renewal metadata |
| Scheduling | OS-native jobs | systemd timer (Linux/WSL), launchd (macOS), Task Scheduler (Windows) |
| Design system | Voidware v1.0.4 | Package-pinned dark-native surfaces, sidebar app shell, and iridescent accent system |

---

## Data Model

All persistent state lives in `data/dash.sqlite`. Schema definition:
[`scripts/schema.sql`](../scripts/schema.sql).

### Tables

#### `models`

Canonical identity for every tracked LLM. One row per model, keyed by unique
`name`. Fields include vendor, color (for UI), release date, parameter count,
pricing string, status (`active` / `superseded` / `deprecated`),
`input_capabilities` (canonical JSON array of `text` / `image` / `audio` /
`video`, default `["text"]`), `deprecated_on` (ISO date stamped when status
becomes `deprecated`, cleared on reactivation), and first/last seen dates.

#### `model_scores`

Append-only score history. Each row records five benchmark dimensions
(`intelligence`, `coding`, `agents`, `speed`, `cost`) for a `(model_id, as_of)`
pair. Re-running an update for the same date upserts via the `UNIQUE` constraint.

Scores are normalized to a 0.0–10.0 scale. Every score claim in a changelog
must cite a source URL.

The dashboard computes composite scores client-side from raw sub-scores stored
in `model_scores` (see `overall()` and `valueScore()` in `web/app.js`). Overall
is a weighted composite: 25% intelligence, 25% coding, 25% agents, 10% speed,
and 15% cost — cost now contributes to Overall so the leaderboard is no longer
price-blind. Value weights Overall at 60%, cost at 25%, and speed at 15%.

#### `changelogs`

Index table for changelog entries. The full Markdown body lives on disk at
`changelogs/YYYY-MM-DD.md`; this table stores frontmatter fields (date, title,
summary, new models, changes) for the changelog list view. On divergence, the
`.md` file is authoritative.

#### `run_metrics`

Per-update-run telemetry. Tracks agent identity, token usage (input, output,
cached), cost, duration, Exa search/fetch counts, and body word count. One row
per changelog date. The Stats view visualizes this data.

#### `meta`

Key-value store for housekeeping. Current keys: `last_updated` (ISO datetime),
`schema_version`, `seed_version`.

#### Schema Versioning

`meta.schema_version` tracks the on-disk DDL contract. The current version is
**4** (Milestone 13): the `models` table carries `input_capabilities`
(TEXT NOT NULL DEFAULT `'["text"]'`, a canonical JSON array subset of
text/image/audio/video) and `deprecated_on` (TEXT nullable, stamped when a
model's status becomes `deprecated`, cleared on reactivation). Every
`model_scores` benchmark column still carries a `CHECK (col IS NULL OR
(col BETWEEN 0 AND 10))` constraint from version 2.

Migration is automatic and idempotent. `scripts/migrate_score_checks.py` and
`scripts/migrate_model_metadata_v4.py` run on FastAPI startup (`server.py`)
and at the top of `scripts/run_update.py`. Score-check migration validates
existing rows, rebuilds `model_scores` with constraints, and bumps older DBs
to version 2. Metadata migration adds the new `models` columns if missing,
recreates `v_models_latest`, and bumps `meta.schema_version` to 4. Fresh
installs from `scripts/init_db.py` already seed at version 4. No backfill:
`input_capabilities` defaults to `["text"]` and `deprecated_on` stays NULL;
update runs populate both from cited primary sources.

### Views

#### `v_models_latest`

Joins `models` with the most recent `model_scores` row per model. This is the
primary query target for the Table and Chart views. Tiebreaker on `id DESC`
makes same-day upserts deterministic.

### Entity Relationship

```
models 1──────∞ model_scores
  │
  │ (name referenced in changelogs.new_models_json / changed_json)
  │
changelogs 1──1 run_metrics (via changelog_date)
  │
  └──── changelogs/*.md (on-disk artifact)
```

---

## Frontend Architecture

### Views

| View | Purpose | Primary Data Source |
|---|---|---|
| **Table** | Sortable model leaderboard with tier-letter score cells, compact mobile cards, comparison selection, search, filters, and CSV export | `v_models_latest`, `model_scores` |
| **Chart** | SVG scatter/radar analysis surface with axis selectors, keyboard-focusable model points, selection panel, legend, and comparison strip | `v_models_latest`, `model_scores` |
| **Changelog** | Date list + rendered Markdown body. The older Compare tab is intentionally removed; changelog files remain append-only (Settings → Reset with typed confirmation is the deliberate operator exception; normal update runs never delete history). | `changelogs` table + `changelogs/*.md` |
| **Stats** | Token/cost/duration analytics, Agent Provider Leaderboard, per-agent breakdowns, and compact trend bars | `run_metrics` |
| **Settings** | Provider, Models, Research, Schedule, and Reset subpages, plus a Manual Update card on the Provider subpage and a sidebar-footer Refresh trigger | `/api/provider`, `/api/exa`, `/api/llmstats`, `/api/schedule`, `/api/run-update`, `/api/reset` |

### State Management

A single `state` object drives all rendering. Mutation triggers a `render()`
call that brute-force re-renders the active view. The dataset is small enough
that this is performant without diffing.

```js
state = {
  area, subpage,     // sidebar area + subpage routing
  models,            // from v_models_latest
  filteredModels,    // filtered and sorted model rows
  changelogs,        // from changelogs table
  metrics,           // from run_metrics
  ui,                // persistent filters, sort direction, chart mode/axes, stats filters
  focusIndex,        // j/k row nav target
  activeChangelogDate,
  lastUpdated,       // from meta.last_updated; polled via /api/meta
  provider,          // from GET /api/provider
};
```

### Filtering

Every filter change rebuilds a parameterized SQL query executed against the
in-browser sql.js instance. Filters include:

- **Vendor select** — provider/vendor narrowing
- **Tier select** — S through F (computed from weighted overall score)
- **Text search** — case-insensitive LIKE across name, vendor, notes, params

### Offline Behavior

Once `dash.sqlite` and vendor scripts are loaded, the dashboard works without
network access. Only update runs (which research new models) require internet.

---

## Server Architecture

`server.py` is a FastAPI application with three responsibilities:

### 1. Static File Serving

Three explicit mounts maintain the frontend's fetch contract:

| Mount | Directory | Serves |
|---|---|---|
| `/data` | `data/` | `dash.sqlite`, `run_metrics.csv` |
| `/changelogs` | `changelogs/` | Daily Markdown files |
| `/` | `web/` | Frontend app (HTML, CSS, JS, vendor libs) |

### 2. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/prompt` | GET | Returns agent-neutral update prompt with repo path and date |
| `/api/bootstrap-status` | GET | First-run DB seeding state for the UI spinner |
| `/api/open-terminal` | POST | Opens a platform-native terminal at the repo root |
| `/api/provider` | GET/POST | Read/write Agent Provider configuration |
| `/api/provider-presets` | GET | Static catalog of provider presets retained for compatibility |
| `/api/provider/test-connection` | GET/POST | Test models endpoint reachability |
| `/api/provider/models` | GET | Fetch + normalize available models from provider |
| `/api/provider/test-model` | POST | Short-prompt roundtrip to verify model access |
| `/api/provider/key` | DELETE | Remove the stored Agent Provider API key |
| `/api/exa` | POST | Save Exa API key |
| `/api/exa` | DELETE | Remove Exa API key |
| `/api/llmstats` | POST/DELETE | Save/remove optional LLM Stats API key |
| `/api/llmstats/test-connection` | GET | Test LLM Stats bearer-auth catalog access |
| `/api/meta` | GET | `{"last_updated": ...}` — used by the 15s client poll to surface a "new data available" toast |
| `/api/schedule` | GET/POST/DELETE | Manage OS-level scheduled update jobs |
| `/api/run-update` | POST | Kick off a background update via Agents SDK |
| `/api/run-update/{id}` | GET | Poll update job status + log tail |
| `/api/reset` | POST | Scoped destructive reset (`stats` / `changelog` / `models` / `full`) with typed `confirm_token`; returns `409` while an in-app update job is running. Full reset also revokes LLM-Dash broker grants and clears the in-process approved-secret cache; partial scopes leave grants alone. Voidware credentials and keyring secrets are never deleted |
| `/api/credentials/discovery` | GET | Safe credential candidates for the `provider` / `exa` / `llmstats` slots: exact-source Voidware refs when available, name-only fallback otherwise, env overrides as read-only rows. Never contains secret values, grant tokens, or encrypted blobs |
| `/api/credentials/slots` | GET | Current slot selections + per-slot auth/grant-renewal status |
| `/api/credentials/slots/{slot}/select` | POST | Select an existing Voidware credential for a slot; requests a durable 120d read grant and persists non-secret selection/grant metadata |
| `/api/credentials/slots/{slot}/save` | POST | Create an LLM-Dash-managed secret at the default `llmdash.*` name and select it |
| `/api/credentials/slots/{slot}/update` | POST | Update the selected key. External (non-LLM-Dash) credentials return `403` unless the request sends `external_mutation=true` **and** `require_fresh_grant=true`, which forces a fresh encryption-password approval |
| `/api/credentials/slots/{slot}/selection` | DELETE | Clear the slot selection in app config only (the Voidware credential is untouched) |
| `/api/credentials/slots/{slot}/credential` | DELETE | Delete the selected Voidware credential and clear the selection; same external-mutation dual-flag rule as update |
| `/api/voidware/broker/approval/deny` | POST | Deny the pending broker approval (used by modal close/deny) |

### 3. First-Run Bootstrap

On startup, if `data/dash.sqlite` doesn't exist, the server spawns
`scripts/init_db.py` in a background thread. The frontend polls
`/api/bootstrap-status` and shows a blocking spinner until the DB is ready.

---

## Update Pipeline

Defined in [`skill/SKILL.md`](../skill/SKILL.md) — the single source of truth
for all agents. High-level flow:

```
 1. Preflight      → record start time, confirm tool availability
 2. Load state     → meta.last_updated, v_models_latest, recent changelogs
 3. Research       → Exa search + fetch (or web-search fallback)
 4. Produce diff   → JSON: new_models, score_updates, status_changes
 5. Apply to DB    → single SQLite transaction
 6. Write .md      → changelogs/YYYY-MM-DD.md with frontmatter + Run Metadata
 7. Record metrics → INSERT INTO run_metrics + regenerate CSV
 8. Bump meta      → UPDATE meta SET last_updated
 9. Self-verify    → checklist: file exists, DB rows present, citations valid
```

### Agent Provider Path

When a BYOK provider is configured, `scripts/run_update.py` executes the
pipeline using the OpenAI Agents SDK. It:

- Reads SKILL.md as the system prompt
- Connects to the configured endpoint with the default model
- Falls back to the backup model on failure
- Mounts Exa as a Remote MCP server for research tools
- Logs all output to `logs/run-update-{job_id}.log`

### Idempotency

Re-running an update for the same date upserts rather than duplicates:
- `changelogs` table: `UNIQUE(date)`
- `run_metrics` table: `UNIQUE(changelog_date)`
- `model_scores` table: `UNIQUE(model_id, as_of)`

---

## Credential & Config Management

### Precedence (read order)

1. Environment variables
2. Selected reusable Voidware provider credential
3. Voidware auth broker
4. Legacy OS keychain (via `keyring` package), read-only for migration

### What's stored where

| Data | Location | Rationale |
|---|---|---|
| Provider, Exa, and LLM Stats API keys | Environment, selected Voidware provider credential, or Voidware broker; legacy keyring reads remain migration fallbacks and new writes require Voidware approval | Secrets never in repo or API responses |
| Provider credential name, base URL, models, headers, grant renewal metadata | `shxdow.llmdash.json` | Non-secret config and renewal prompts |
| Selected credential identity per slot (`provider` / `exa` / `llmstats`): serialized Voidware ref or name fallback, safe metadata, grant renewal metadata | `shxdow.llmdash.json` (config `version: 2`; v1 files migrate in place) | One selected secret per feature without persisting secret material |
| Selected provider grant token | Voidware OS keyring service `voidware-client-grants` | Opaque broker grant reuse without writing tokens to config |
| Exa API key | Same as provider API key | Same credential pipeline |
| LLM Stats API key | Same as provider API key | Optional enrichment credential |

API keys are **never** returned in API responses, logged, or written to any
on-disk trace outside the credential store. Provider discovery returns redacted
Voidware metadata only. Selected credentials are read through the app-owned
Node bridge in `scripts/voidware_app_broker.mjs`, which hosts Voidware 1.0.4's
approval surface for the FastAPI/browser app. Grants request the longest
supported lifetime (`120d`), and the returned renewal window metadata
(`renewAfter` / `renewalWindowStartsAt`) drives the in-app renewal prompt.
Opaque grant tokens are cached by Voidware's
`voidware-client-grants` keyring helper and are cleared/re-requested on
renewal, expiration, invalidation, denial, or durable-secret-unavailable
responses. The old `llm-dash-voidware-grants` namespace is retained only as a
cleanup-era compatibility detail.
When a background Voidware access service blocks in-app approval, Settings can
call `POST /api/voidware/broker/stop` after user confirmation to stop that
external service and retry with the app-owned approval surface.

---

## Design System — Voidware v1.0.4

The UI follows the Voidware design specification:

- **Dark-native** — `color-scheme: dark`, `#0a0a0a` base
- **Shadow-as-border** — `box-shadow: 0 0 0 1px` instead of `border: 1px solid`
- **7-color iridescent palette** — amber through pink, used for tier badges,
  gradients, and accent elements
- **Typography** — SUSE / Roboto for body, JetBrains Mono for code/scores
- **Surface hierarchy** — four surface levels (`#171717` → `#313131`) for depth
- **Focus pattern** — `outline` with `outline-offset`, not box-shadow focus rings

CSS custom properties on `:root` make the entire theme overridable.

Milestone 11 updates Voidware to the explicit
`@shxdowcollective/voidware@1.0.4` dependency. LLM-Dash still serves committed
static CSS at runtime; the package is the source for vendoring, runtime API
audits, and the ground-up app CSS rebuild. Refresh vendored CSS with
`npm run vendor:voidware` after `npm ci`. The app-owned approval bridge still
depends on a Voidware CLI service build exposed through
`VOIDWARE_CLI_SERVICE_MODULE`; the root package exports auth/config/logging
helpers but not the CLI broker host.

---

## Scheduling

Three OS-native mechanisms, selected automatically by `scripts/schedule_job.py`:

| Platform | Mechanism | Job Location |
|---|---|---|
| Linux / WSL | systemd user timer | `~/.config/systemd/user/llm-dash-update.*` |
| macOS | launchd plist | `~/Library/LaunchAgents/com.llm-dash.update.plist` |
| Windows | Task Scheduler | `schtasks /create /xml` with LLM-Dash task name |

All jobs invoke `scripts/run_update.py` with the configured provider. Cadence
options: daily, weekly (pick day), monthly (pick date). The "Off" state removes
the job entirely.

---

## Key Design Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Frontend framework | Vanilla JS | React, Preact, Vite | No-build is the hardest constraint |
| SQL in browser | sql.js (WASM) | Preload-to-JSON, IndexedDB | Real SQL for complex filtering |
| Server | FastAPI | `http.server`, Node/Express | Needs API routes; Python ecosystem |
| Agent framework | OpenAI Agents SDK | Direct API calls, LangChain | BYOK-compatible, vendor-neutral |
| Update contract | SKILL.md (agent reads it) | Python `update.py` script | Agent-agnostic; any LLM can follow it |
| Scheduling | OS-native jobs | Claude Code `/schedule`, cron | Reliable, survives reboots, no dependency on Claude |
| Credential store | env → selected Voidware provider → Voidware broker → keyring | env-only, dotenv | Layered precedence: process env first, then reusable brokered provider grants, with keyring kept as a legacy migration fallback |
| Chart surface | SVG + CSS | Chart.js, `<canvas>`, uPlot | Zero-build, accessible SVG model points, and lightweight telemetry bars |
