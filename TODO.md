# TODO

Rough execution order. Newest decisions at the top.

## Phase 0 — Scaffold (this PR)

- [x] Repo structure, README, LOGBOOK, full implementation plan
- [x] Stack decisions (sql.js, FastAPI, Exa, SKILL.md-as-contract)
- [x] `skill/SKILL.md` — agent-agnostic update procedure
- [x] `CLAUDE.md` — Claude-specific entry pointer
- [x] `AGENTS.md` — generic-agent entry pointer
- [x] Decision: daily scheduling = Claude Code `/schedule` skill only
- [x] Decision: no cost cap; full token/cost/duration logging instead
- [x] Decision: Refresh button = clipboard prompt + Open Terminal (UI stays read-only)
- [x] Decision: Refresh modal prompt text = agent-neutral; CLI examples live in hint copy only
- [x] Decision: Windows desktop shortcut = document only; do not ship a repo `.lnk`
- [x] Decision: first-run bootstrap = `server.py` auto-runs `scripts/init_db.py`; UI shows a spinner until ready

## Phase 1 — Data layer

- [x] `scripts/schema.sql` — `models`, `model_scores`, `changelogs`, `run_metrics`, `meta`, `v_models_latest`
- [x] `scripts/init_db.py` — build `data/dash.sqlite` from schema + seed 34-model dataset from the reference JSX
- [x] `changelogs/2026-04-20.md` — project-start changelog (Run Metadata footer included; agentless seed values allowed)
- [x] `scripts/export_metrics_csv.py` — regenerate `data/run_metrics.csv` from the `run_metrics` table
- [x] Seed initial `run_metrics` row for the bootstrap entry (so Stats page has something to show day 1)
- [ ] Add score-range schema hardening migration for `model_scores`
  Validate existing rows, rebuild the table with `CHECK (col BETWEEN 0 AND 10)` constraints, recreate indexes, and bump `meta.schema_version`.

## Phase 2 — Static frontend

- [x] `web/index.html` — shell, CSS vars, font imports, view-mount points
- [x] `web/style.css` — Voidware tokens + component styles (shadow-as-border; iridescent tier colors)
- [x] `web/vendor/sql-wasm.{js,wasm}` vendored (marked.min.js deferred to Changelog slice)
- [x] `web/app.js` — sql.js loader, state, `render()` dispatcher
- [x] Port JSX helpers (`tier`, `barColor`, `avg`, `getOverall`, `getValue`)
- [x] Port JSX components (ScoreCell, DetailPanel, model row, chart row)
- [x] Sort controls (done) + vendor multi-select + tier chips + range sliders + text search
- [x] **Table** view
- [x] **Chart** view
- [x] **Changelog** view (date list + marked.js renderer) — vendor `marked.min.js`
- [x] **Stats** view
    - [x] Totals cards (Σ cost, Σ tokens, Σ duration, run count, word total)
    - [x] Averages cards (per-run cost, per-run duration, words/run, cost/word)
    - [x] Per-agent breakdown table
    - [x] Time-series canvas charts (cost, duration, tokens, word_count per day)
    - [x] Run-metrics table (sortable)
    - [x] Stats filters (date range, agent)
- [x] Last-updated freshness pill (reads `meta.last_updated`)

## Phase 3 — CSV exports

- [x] Models CSV export (filtered Table view → client-side download)
- [x] Metrics CSV download (Stats page → link to `/data/run_metrics.csv`)
- [x] Verify both CSVs open cleanly in Excel / Numbers / LibreOffice
  Verified here: browser downloads + Python `csv.reader` parse for both files. User also confirmed both CSVs open cleanly in Excel on Windows. Numbers / LibreOffice were not checked here, but the Excel smoke test is done.

## Phase 4 — Server + Refresh UX

- [x] `server.py` — FastAPI app (static mounts + bootstrap-state + API routes)
- [x] `requirements.txt` — fastapi, uvicorn
- [x] `GET /api/prompt` — return agent-neutral prompt (absolute repo path + today + last_updated)
- [x] `GET /api/bootstrap-status` — expose first-run DB bootstrap state for the UI spinner
- [x] `POST /api/open-terminal` — platform chain: Windows Terminal → cmd; macOS Terminal.app; Linux gnome-terminal / konsole / xfce4-terminal / xterm
- [x] Auto-run `scripts/init_db.py` when `data/dash.sqlite` is missing on first launch
- [x] Mount `/data` so the current frontend keeps `/data/dash.sqlite` and `/data/run_metrics.csv` unchanged
- [x] Mount `/changelogs` so the current Changelog fetch path keeps working unchanged
- [x] UI Refresh button: auto-copy prompt to clipboard + show modal with prompt + Open Terminal + Copy-again buttons + paste-hint
- [x] UI first-run state: blocking spinner/status copy while DB bootstrap is running
- [x] Verify clipboard-copy fallback path when `navigator.clipboard` is blocked
  Verified here: real uvicorn smoke test for `/`, `/api/prompt`, `/api/bootstrap-status`, `/data/run_metrics.csv`, and `/changelogs/2026-04-20.md`, plus a first-run temp-repo boot with `data/dash.sqlite` deleted to confirm automatic seeding. Clipboard fallback was checked in headless Chrome/CDP by forcing `navigator.clipboard.writeText()` to throw; the modal still opened, the prompt rendered, and the full prompt text was auto-selected for manual copy.

## Phase 5 — Scheduling + launchers

- [x] `run.sh` (POSIX) and `run.bat` (Windows) — repo-local `.venv`, default
  port `8787` (override via `LLM_DASH_PORT`), readiness poll before browser
  open, foreground uvicorn lifecycle, clean trap on exit.
- [x] `docs/scheduling.md` — Claude Code `/schedule` prompt text, `0 9 * * *`
  default cadence, dry-run checklist.
- [x] README rewritten: quick-start matches the launchers that now exist,
  Windows-shortcut + macOS Automator notes, troubleshooting section for
  `python3-venv`, port conflicts, and browser auto-open.
- [x] POSIX smoke test: uvicorn + `/api/bootstrap-status`, stats charts
  verified in headed browser.
- [x] Stats charts: vendored uPlot 1.6.31 (52 KB min, zero deps) and swapped
  the hand-rolled canvas for proper time axes + hover readouts. Voidware-
  skinned, instances destroyed on view-leave.

Phase 5 `/schedule` dry-run and Windows smoke tests are intentionally
dropped. Scheduling is being re-architected in Phase 7 via an OS-level task
written by the setup wizard; Claude Code `/schedule` turns out to be a
remote-agent trigger, not the local cron the old plan assumed.

## Phase 6 — Pivot: Agent Provider via OpenAI Agents SDK (BYOK)

Goal: add a first-class execution path where the dashboard runs SKILL.md
itself via [openai-agents-python](https://github.com/openai/openai-agents-python)
against a user-supplied OpenAI-compatible endpoint. The existing "point any
CLI agent at the repo" flow stays as the escape hatch.

Decisions locked:

- **Framework:** `openai-agents` (pinned). No other SDKs.
- **Terminology:** rename **runtime → Agent Provider** across user-visible
  surfaces (docs, UI copy, API field names, prompt strings). Don't rewrite
  history in past logbook entries.
- **BYOK mandatory.** No bundled credentials, no defaults, no fallback keys.
- **Config precedence (read + write order):** env var → OS keychain →
  `~/.shxdow/auth.json` → `~/.shxdow/config/shxdow.llmdash.json`. Voidware
  spec is authoritative for the last two.
- **Provider fields:** `BASE_URL` (required), `API_KEY` (required),
  `MODELS_OVERRIDE_URL` (optional). Endpoints resolve to
  `{BASE_URL}/v1/chat/completions` and
  `{MODELS_OVERRIDE_URL or BASE_URL}/v1/models` — app never accepts a
  `BASE_URL` that already contains `/v1`.
- **App fields:** default model, backup model, optional request-headers map.
- **Exa** attaches as a **Remote MCP server** registered with the Agents
  SDK. No local Exa client lib.

Planning:

- [x] M6.1-M6.4 implementation plan written:
  [docs/plans/M6_AGENT_PROVIDER_BACKEND_PLAN.md](docs/plans/M6_AGENT_PROVIDER_BACKEND_PLAN.md).

### Milestones

**M6.1 — Rename runtime → Agent Provider**
- [x] Sweep README, SKILL.md, `docs/plans/IMPLEMENTATION_PLAN.md`,
  `docs/scheduling.md`, all UI copy. Future logbook entries use the new
  term; old entries stay as-is.
- [x] Update `/api/prompt` body + any response field names that leak the
  old "runtime" label.

**M6.2 — Config + credential layer (backend)**
- [x] `scripts/config.py` — unified reader/writer honoring the precedence
  order above.
- [x] Keychain integration via the `keyring` Python package; graceful
  degrade to auth.json when the backend is unavailable (headless Linux).
- [x] Voidware helpers for `~/.shxdow/auth.json` +
  `~/.shxdow/config/shxdow.llmdash.json`.
- [x] `API_KEY` never appears in any API response, log line, or on-disk
  trace outside the credential store.

**M6.3 — Agents SDK plumbing (backend)**
- [x] Add `openai-agents` to `requirements.txt` with a pinned version.
- [x] `scripts/run_update.py` — executes SKILL.md end-to-end via the Agents
  SDK. Default model first, backup model on failure, optional headers
  applied. Emits the same side effects as a manual CLI agent run (new
  `changelogs/YYYY-MM-DD.md`, `run_metrics` row, CSV regen, `meta.last_updated`).
- [x] Wire Exa as a Remote MCP server in the Agents SDK session config.
- [x] Per-run log file under `logs/` for debugging.

**M6.4 — API routes**
- [x] `GET /api/provider` → `{ has_provider, base_url, chat_endpoint,
  models_endpoint, default_model, backup_model, exa_configured }` (no
  secrets, ever).
- [x] `POST /api/provider` — write config per voidware spec.
- [x] `GET /api/provider/test-connection` — `GET` models endpoint; pass iff
  200 OK.
- [x] `GET /api/provider/models` — proxy + normalize for the wizard.
- [x] `POST /api/provider/test-model` — short-prompt roundtrip for
  `{default, backup}`.
- [x] `POST /api/exa` — save Exa API key per voidware spec.
- [x] `POST /api/run-update` + `GET /api/run-update/{id}` — kick off + poll
  a background `run_update.py` job.

**M6.5 — UI integration**
- [ ] Refresh button: if `has_provider=true`, `POST /api/run-update` and
  show a progress overlay; otherwise open the Phase 7 wizard. The
  clipboard + Open-Terminal flow moves out of the modal.
- [ ] New **"AI Prompt for updating"** card inside the Data tab — renders
  the agent-neutral prompt, copy button, "Open Terminal", and the paste
  hint. This is the manual-CLI escape hatch, deliberately separate from
  Refresh.
- [x] Replace any remaining "runtime" label in the UI.

**M6.6 — Provider preset catalog**
- [ ] JSON list of popular providers (OpenAI, Anthropic-OpenAI-compat,
  Google AI Studio, OpenRouter, Kilo Gateway, local Ollama / llama.cpp). Consumed by the wizard (Phase 7).

## Phase 7 — Setup wizard + OS-level scheduling

Goal: a first-run wizard that configures the Agent Provider end-to-end and
finishes with an optional OS-level scheduled job.

Triggers:
- Dashboard load when `GET /api/provider` returns `has_provider=false`.
- A "Configure Agent Provider" button inside the Data tab.

**M7.1 — Wizard shell**
- [ ] Six-step state machine, progress indicator, back / next / skip
  controls, Voidware-spec styling.
- [ ] Auto-open on first load when no provider; manual entry point in Data
  tab.

**M7.2 — Step 1: Credentials**
- [ ] Preset dropdown = M6.6 catalog merged with saved profiles read from
  keychain / auth.json.
- [ ] Fields: `BASE_URL`, `API_KEY` (hidden), `MODELS_OVERRIDE_URL`
  (optional), optional request-headers key/value list.
- [ ] Live endpoint preview: `Chat: {BASE_URL}/v1/chat/completions` and
  `Models: {MODELS_OVERRIDE_URL or BASE_URL}/v1/models`. Inline hint: "do
  not include `/v1` in BASE_URL".
- [ ] "Test connection" → `GET /api/provider/test-connection`.
- [ ] "Skip" button appears **only after** a failed test.
- [ ] On continue: credentials written per voidware spec (M6.2).

**M7.3 — Step 2: Model selection**
- [ ] Two searchable dropdowns (default + backup) populated from
  `/api/provider/models`.
- [ ] If the user types a model not in the fetched list: confirmation
  modal before continuing.

**M7.4 — Step 3: Model connection test (unskippable)**
- [ ] Short-prompt roundtrip against default + backup via
  `/api/provider/test-model`.
- [ ] On failure: Retry or Restart. Restart wipes credentials + model
  selection and drops the user back to Step 1.

**M7.5 — Step 4: Exa**
- [ ] If Exa key already present in env / keychain / auth.json: skip the
  step silently.
- [ ] Otherwise: input + "Sign up for Exa" link + short explainer.
- [ ] "Skip" is allowed but shows a warning about free-tier rate limits
  before confirming.

**M7.6 — Step 5: Scheduling (optional)**
- [ ] Cadence picker: Off / Daily / Weekly (day-of-week) / Monthly
  (day-of-month).
- [ ] Time-of-day picker in local time, with UTC echo for sanity.
- [ ] `scripts/schedule_job.py` with platform branches:
  - Linux / WSL → systemd user timer.
  - macOS → launchd agent plist in `~/Library/LaunchAgents/`.
  - Windows → Task Scheduler task via `schtasks /create /xml`.
- [ ] Job invokes `scripts/run_update.py` (M6.3); per-platform log path.
- [ ] API: `GET` / `POST` / `DELETE /api/schedule`. "Off" removes the job.

**M7.7 — Step 6: Summary + finalize**
- [ ] Review screen listing everything about to be written (creds hint
  only — no raw key).
- [ ] Finish → persists remaining config + kicks off an immediate Refresh
  via M6.5.

**M7.8 — Smoke + verification**
- [ ] End-to-end wizard run against a real OpenAI-compatible endpoint
  (local Ollama or OpenRouter free tier).
- [ ] Schedule creation verified via `systemctl --user list-timers` on
  Linux, `launchctl list` on macOS, `schtasks /query` on Windows.
- [ ] "Off" state proven to disable + remove the job.

## Nice-to-haves (post-v1)

- [ ] Sparklines of each model's score trajectory
- [ ] Diff view between any two dates
- [ ] Markdown-exportable model report
- [ ] Keyboard shortcuts (`/` search, `j/k` row nav, `e` export, `r` refresh)
- [ ] Auto-poll `meta.last_updated` every 15s; show "new data available" toast
- [ ] Agent Provider leaderboard on Stats page (cost-per-word, words-per-dollar, fastest wall-clock)
- [ ] Per-model score trend chart inside DetailPanel
