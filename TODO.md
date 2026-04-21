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
- [x] Decision: Refresh modal prompt text = agent-neutral; runtime examples live in hint copy only
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

- [ ] `server.py` — FastAPI app (static mounts + bootstrap-state + API routes)
- [ ] `requirements.txt` — fastapi, uvicorn
- [ ] `GET /api/prompt` — return agent-neutral prompt (absolute repo path + today + last_updated)
- [ ] `GET /api/bootstrap-status` — expose first-run DB bootstrap state for the UI spinner
- [ ] `POST /api/open-terminal` — platform chain: Windows Terminal → cmd; macOS Terminal.app; Linux gnome-terminal / konsole / xfce4-terminal / xterm
- [ ] Auto-run `scripts/init_db.py` when `data/dash.sqlite` is missing on first launch
- [ ] Mount `/data` so the current frontend keeps `/data/dash.sqlite` and `/data/run_metrics.csv` unchanged
- [ ] Mount `/changelogs` so the current Changelog fetch path keeps working unchanged
- [ ] UI Refresh button: auto-copy prompt to clipboard + show modal with prompt + Open Terminal + Copy-again buttons + paste-hint
- [ ] UI first-run state: blocking spinner/status copy while DB bootstrap is running
- [ ] Verify clipboard-copy fallback path when `navigator.clipboard` is blocked

## Phase 5 — Scheduling + launchers

- [ ] `run.bat` — Windows launcher (installs deps + starts uvicorn + opens browser)
- [ ] `run.sh` — POSIX launcher (same)
- [ ] Create Claude Code `/schedule` trigger pointing at SKILL.md
- [ ] Desktop shortcut guide in README (Windows + macOS)

## Nice-to-haves (post-v1)

- [ ] Sparklines of each model's score trajectory
- [ ] Diff view between any two dates
- [ ] Markdown-exportable model report
- [ ] Keyboard shortcuts (`/` search, `j/k` row nav, `e` export, `r` refresh)
- [ ] Auto-poll `meta.last_updated` every 15s; show "new data available" toast
- [ ] Agent leaderboard on Stats page (cost-per-word, words-per-dollar, fastest runtime)
- [ ] Per-model score trend chart inside DetailPanel

## Remaining open question

- ? Stats charts: plain canvas (zero deps, a bit crude) or vendor a tiny lib like uPlot?
