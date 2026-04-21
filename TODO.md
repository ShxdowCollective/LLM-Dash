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

## Phase 1 — Data layer

- [ ] `scripts/schema.sql` — `models`, `model_scores`, `changelogs`, `run_metrics`, `meta`, `v_models_latest`
- [ ] `scripts/init_db.py` — build `data/dash.sqlite` from schema + seed 34-model dataset from the reference JSX
- [ ] `changelogs/2026-04-20.md` — project-start changelog (Run Metadata footer included; agentless seed values allowed)
- [ ] `scripts/export_metrics_csv.py` — regenerate `data/run_metrics.csv` from the `run_metrics` table
- [ ] Seed initial `run_metrics` row for the bootstrap entry (so Stats page has something to show day 1)

## Phase 2 — Static frontend

- [ ] `web/index.html` — shell, CSS vars, font imports, view-mount points
- [ ] `web/style.css` — Voidware tokens + component styles (shadow-as-border; iridescent tier colors)
- [ ] `web/vendor/sql-wasm.{js,wasm}` + `web/vendor/marked.min.js`
- [ ] `web/app.js` — sql.js loader, state, `render()` dispatcher
- [ ] Port JSX helpers (`tier`, `barColor`, `avg`, `getOverall`, `getValue`)
- [ ] Port JSX components (ScoreCell, DetailPanel, model row, chart row)
- [ ] Sort controls + vendor multi-select + tier chips + range sliders + text search
- [ ] **Table** view
- [ ] **Chart** view
- [ ] **Changelog** view (date list + marked.js renderer)
- [ ] **Stats** view
    - [ ] Totals cards (Σ cost, Σ tokens, Σ duration, run count, word total)
    - [ ] Averages cards (per-run cost, per-run duration, words/run, cost/word)
    - [ ] Per-agent breakdown table
    - [ ] Time-series canvas charts (cost, duration, tokens, word_count per day)
    - [ ] Run-metrics table (sortable)
    - [ ] Stats filters (date range, agent)
- [ ] Last-updated freshness pill (reads `meta.last_updated`)

## Phase 3 — CSV exports

- [ ] Models CSV export (filtered Table view → client-side download)
- [ ] Metrics CSV download (Stats page → link to `/data/run_metrics.csv`)
- [ ] Verify both CSVs open cleanly in Excel / Numbers / LibreOffice

## Phase 4 — Server + Refresh UX

- [ ] `server.py` — FastAPI app (static mount + API routes)
- [ ] `requirements.txt` — fastapi, uvicorn
- [ ] `GET /api/prompt` — return agent prompt (absolute repo path + today + last_updated)
- [ ] `POST /api/open-terminal` — platform chain: Windows Terminal → cmd; macOS Terminal.app; Linux gnome-terminal / konsole / xfce4-terminal / xterm
- [ ] Mount `/data` so the Stats page can download `run_metrics.csv` directly
- [ ] UI Refresh button: auto-copy prompt to clipboard + show modal with prompt + Open Terminal + Copy-again buttons + paste-hint
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

## Open questions (non-blocking)

- ? Prompt wording in the Refresh modal — agent-neutral default, or Claude-shaped with a runtime-switcher?
- ? Ship a Windows `.lnk` directly, or document "Create shortcut → drag to desktop"?
- ? Stats charts: plain canvas (zero deps, a bit crude) or vendor a tiny lib like uPlot?
- ? First-run UX when DB is missing — splash with instructions, or auto-run `init_db.py` the first time `server.py` starts?
