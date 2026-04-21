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

Goal: make local launch actually one-click on desktop and make the daily
Claude Code update flow reproducible without relying on system-global Python
installs or README fiction.

Approach:

- Use a repo-local `.venv` in both launchers so Windows/macOS/Linux all avoid
  PEP 668 and random user-environment drift.
- Treat Claude Code `/schedule` as documented user-environment setup, not a
  magical repo file we can pretend to version-control.
- Fold README cleanup into this phase, because the current quick-start copy
  already talks like the launchers exist.

Detailed plan:

1. Launcher contract

- [ ] Lock the runtime contract: repo-root working dir, repo-local `.venv`,
  default port `8787`, optional override via `LLM_DASH_PORT`, best-effort
  browser open, foreground server lifecycle.
- [ ] Confirm `uvicorn server:app` is still the only required entrypoint and
  no extra CLI flags are needed beyond host/port.

2. `run.sh`

- [ ] Create `run.sh` with repo-root resolution from the script path and a
  hard `cd` into the repo.
- [ ] Resolve Python in this order: `python3`, then `python`.
- [ ] Create `.venv` if missing, upgrade `pip`, and install
  `requirements.txt` inside the venv.
- [ ] Start `uvicorn server:app` on `127.0.0.1:${LLM_DASH_PORT:-8787}` using
  the venv interpreter.
- [ ] Poll the local server before opening the browser so startup isn't a race.
- [ ] Open via `xdg-open` or `open`; if that fails, print the URL and keep
  serving normally.
- [ ] Trap exit signals and stop the uvicorn child process cleanly.

3. `run.bat`

- [ ] Create `run.bat` with `cd /d %~dp0`.
- [ ] Resolve Python in this order: `py -3`, then `python`.
- [ ] Create `.venv` if missing and install `requirements.txt` inside it.
- [ ] Start `uvicorn server:app` on `127.0.0.1:%LLM_DASH_PORT%` with `8787`
  as the default.
- [ ] Add a small readiness loop before launching the browser.
- [ ] Keep uvicorn attached to the console so closing the window actually
  stops the server.
- [ ] Echo useful failure text for missing Python / venv / pip issues.

4. Claude Code scheduling

- [ ] Capture the exact `/schedule` prompt text using the current SKILL.md
  contract and repo-path expectations.
- [ ] Document the trigger cadence as `0 9 * * *` local time unless the user
  changes it.
- [ ] Add README/setup instructions for creating the `/schedule` trigger
  manually in Claude Code.
- [ ] Dry-run the schedule prompt as a normal manual agent run before calling
  automation done.

5. README + shortcut docs

- [ ] Replace the current README launch instructions that assume
  `run.sh`/`run.bat` already exist.
- [ ] Add Windows desktop shortcut steps for `run.bat`.
- [ ] Add macOS Automator wrapper steps for `run.sh`.
- [ ] Add troubleshooting notes for first-run dependency install, port
  conflicts, and browser auto-open failures.

6. Verification / done bar

- [ ] POSIX smoke test from a clean-ish repo state with no `.venv`.
- [ ] Windows smoke test on a real Windows machine.
- [ ] API spot checks: `/`, `/api/prompt`, `/api/bootstrap-status`,
  `/data/run_metrics.csv`.
- [ ] Schedule dry run proves the documented prompt still yields a
  SKILL.md-compliant update session.

Risks / watch-outs:

- System `pip install` is a footgun here; keep launcher deps inside `.venv`.
- `/schedule` is user-environment state, so the repo can document it but can't
  fully own it.
- Browser-open helpers vary across Linux desktop environments; the failure mode
  should still leave a printed URL and a running server.

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
