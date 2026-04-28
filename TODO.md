# TODO

# LLM-Dash Task Board

Rough execution order. Newest decisions at the top.

Use `[x]` for done and `[ ]` for still-open. New work should start at the top.

## Phase 8.4 — Wizard spacing polish

Goal: fix the cramped first setup step Advanced section and sweep nearby app
form/card spacing for the same problem.

- [x] `web/app.js`: wrap Advanced contents so spacing is stable inside
  `<details>`.
- [x] `web/style.css`: loosen wizard field, preview, Advanced, header-editor,
  segmented-control, and mobile header-row spacing.
- [x] Verification: JS syntax check plus headed browser screenshots for the
  wizard and main dashboard views.

## Phase 8.3 — Launcher reset mode

Goal: add `--reset` to the launchers so a local install can be wiped back to
first-run state and land directly in the setup wizard.

- [x] `scripts/reset_local_state.py`: clear app config/secrets, remove the
  scheduled job, and delete generated SQLite/CSV data.
- [x] `run.sh` / `run.bat`: parse `--reset`, run the shared reset helper, and
  open the dashboard with the wizard forced visible.
- [x] Frontend/docs: support the reset launch URL, preserve changelog history,
  and document the new command.

## Phase 8.2 — Windows UNC launcher fix

Goal: make `run.bat` work when launched from a WSL repo path like
`\\wsl.localhost\Debian\home\phxntom\Repos\LLM-Dash`.

- [x] `run.bat`: detect WSL UNC script paths before `cd`, translate them to the
  Linux path, and delegate to `run.sh` through `wsl.exe`.
- [x] README: document that WSL UNC launches are handed to the Linux launcher.
- [x] Verification: Windows `cmd.exe` help smoke for UNC-style execution.

## Phase 8.1 — Silent background launcher

Goal: add a `--silent` mode for startup tasks so the dashboard server detaches,
survives terminal close, skips browser launch, and prints the reachable URL.

- [x] `run.sh`: parse `--silent`, support `LLM_DASH_HOST`, detach uvicorn with
  logs under `logs/server.log`, wait for readiness, print only the server URL on
  success.
- [x] `run.bat`: mirror `--silent` behavior through the shared Python launcher,
  log redirection, readiness polling, and URL-only success output.
- [x] README: document foreground vs silent launch, LAN binding with
  `LLM_DASH_HOST=0.0.0.0`, and the server log path.
- [x] Verification: shell syntax check, Python compile check, Windows help check,
  POSIX silent smokes against non-default localhost/LAN-bound ports, and a
  loopback-vs-wildcard port collision check.

## Phase 8 — UI polish (this session)

- [x] Switch dashboard typography from mono-heavy UI defaults to Voidware standard body/display stack (`--vw-font-body`, `--vw-font-mono` aligned to SUSE/Roboto).
- [x] Make pre-leaderboard UI surfaces collapsible: model filters, stats filters, and model info panel.
- [x] Persist each panel's collapse state in localStorage (`llm-dash-ui-state-v1`) so preferences survive reload.
- [x] Update stats chart axis typography to the same body font family.

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
  `MODELS_OVERRIDE_URL` (optional). Default endpoint mode is `append_v1`,
  resolving to `{BASE_URL}/v1/chat/completions` and
  `{MODELS_OVERRIDE_URL or BASE_URL}/v1/models`; provider-root mode resolves
  to `{BASE_URL}/chat/completions` and `{MODELS_OVERRIDE_URL or BASE_URL}/models`
  for APIs like Google AI Studio and Kilo Gateway.
- **App fields:** default model, backup model, optional request-headers map.
- **Exa** attaches as a **Remote MCP server** registered with the Agents
  SDK. No local Exa client lib.

Planning:

- [x] M6.1-M6.4 implementation plan written:
  [docs/plans/M6_AGENT_PROVIDER_BACKEND_PLAN.md](docs/plans/M6_AGENT_PROVIDER_BACKEND_PLAN.md).
- [x] M6.5 UI integration plan written:
  [docs/plans/M6_5_UI_INTEGRATION_PLAN.md](docs/plans/M6_5_UI_INTEGRATION_PLAN.md).

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
  Plan: [docs/plans/M6_5_UI_INTEGRATION_PLAN.md](docs/plans/M6_5_UI_INTEGRATION_PLAN.md)
- [x] D1: Fetch provider state on boot (`GET /api/provider` → `state.provider`).
- [x] D2: Bifurcate Refresh button — provider path → `startRunUpdate()`;
  no-provider path → existing clipboard modal (Phase 7 replaces with wizard).
- [x] D3: Run-update progress overlay — poll `GET /api/run-update/{id}`,
  live log tail, elapsed timer, success/failure terminal states.
- [x] D4: New **Data** view tab + **"AI Prompt for updating"** card —
  renders the agent-neutral prompt, copy button, "Open Terminal", paste
  hint. This is the manual-CLI escape hatch, deliberately separate from
  Refresh.
- [x] D5: Rename `refreshModal` → `manualRefreshModal` for naming clarity.
- [x] D6: DB reload after successful run — re-fetch sqlite, reopen,
  `loadStaticState()`, update freshness pill, no full page reload.
- [x] Replace any remaining "runtime" label in the UI.

**M6.6 — Provider preset catalog**
- [x] Plan: add a static JSON catalog for OpenAI, Anthropic OpenAI-compatible,
  Google AI Studio, OpenRouter, Kilo Gateway, NanoGPT, and Custom
  OpenAI-compatible; expose it through FastAPI; add endpoint-mode support so
  presets can preview/test the right chat/models URLs; update docs and verify
  config/API smokes.
- [x] JSON list of popular providers (OpenAI, Anthropic-OpenAI-compat,
  Google AI Studio, OpenRouter, Kilo Gateway, NanoGPT, Custom OpenAI-compatible
  with local Ollama / llama.cpp / LM Studio examples). Consumed by the wizard
  (Phase 7).

## Phase 7 — Setup Wizard + OS-Level Scheduling + Voidware Upgrade

Goal: first-run wizard that configures the Agent Provider end-to-end,
optional OS-level scheduled jobs, and upgrade from Voidware v0.4.1 to
v0.7.1.

Planning:

- [x] Full implementation plan written:
  [docs/plans/M7_SETUP_WIZARD_PLAN.md](docs/plans/M7_SETUP_WIZARD_PLAN.md).

Triggers:
- Dashboard load when `GET /api/provider` returns `has_provider=false`.
- A "Configure Agent Provider" button inside the Data tab.

### Part A — Voidware v0.4.1 → v0.7.1 Upgrade

**M7.0 — Voidware upgrade (ships independently before wizard)**
- [x] A.1: Update `:root` token contract — 7-color iridescent palette,
  new surface-inverse / module-accent / weight / semantic / shadow / layout /
  transition tokens.
- [x] A.2: Gradient and color reference sweep — site title gradient, tier
  color mapping, sort/filter active states, stale pill, focus rings
  migrated to `outline` pattern.
- [x] A.3: Port Voidware v0.7.1 component CSS — wizard progress, button
  variants, input fields, cards, status chips, modals, animations.

### Part B — Setup Wizard

**M7.1 — Wizard shell**
- [x] Six-step state machine, progress indicator, back / next / skip
  controls, Voidware wizard CSS.
- [x] Auto-open on first load when no provider; manual entry point in Data
  tab; entry from Refresh button when no provider.

**M7.2 — Step 0: Provider + Credentials**
- [x] Preset dropdown from M6.6 catalog (`GET /api/provider-presets`).
- [x] Fields: `BASE_URL`, `API_KEY` (password), `MODELS_OVERRIDE_URL`
  (optional), endpoint mode from preset, optional request-headers editor.
- [x] Live endpoint preview (chat + models URLs) updates on keystroke.
- [x] "Test Connection" → `POST /api/provider/test-connection` for transient credentials.
- [x] "Skip" appears **only after** a failed test.
- [x] Collapsed "Advanced" section for endpoint mode, headers, models
  override URL.
- [x] On continue: credentials written via `POST /api/provider`.

**M7.3 — Step 1: Model Selection**
- [x] Two searchable dropdowns (default + backup) populated from
  `GET /api/provider/models`.
- [x] Fallback to manual entry when provider has no models endpoint
  (pre-fill from preset `model_examples`).
- [x] Custom model ID confirmation inline.

**M7.4 — Step 2: Model Connection Test (unskippable)**
- [x] Sequential `POST /api/provider/test-model` for default then backup.
- [x] Per-model status: pending → testing → success / failed.
- [x] On failure: Retry or Restart (back to Step 0).

**M7.5 — Step 3: Exa**
- [x] Auto-skip when `state.provider.exa_configured === true`.
- [x] Single password input + "Sign up at exa.ai" link.
- [x] Skip allowed with rate-limit warning confirmation.

**M7.6 — Step 4: Scheduling (optional)**
- [x] Cadence picker: Off / Daily / Weekly / Monthly segmented control.
- [x] Time-of-day in local time with UTC echo.
- [x] `scripts/schedule_job.py` with platform branches:
  - Linux / WSL → systemd user timer (detect WSL systemd availability).
  - macOS → launchd plist in `~/Library/LaunchAgents/`.
  - Windows → Task Scheduler via `schtasks /create /xml`.
- [x] Job invokes `scripts/run_update.py`; per-platform log path.
- [x] API: `GET` / `POST` / `DELETE /api/schedule`. "Off" removes the job.

**M7.7 — Step 5: Summary + Finalize**
- [x] Review screen (creds hint only — `sk-...xxxx`).
- [x] Finish → persist config + close wizard + re-fetch provider state +
  immediate `POST /api/run-update`.

**M7.8 — UI Integration**
- [x] Refresh button: no provider → open wizard (not manual refresh modal).
- [x] Data view: provider status card with Reconfigure + Manage Schedule.
- [x] `renderOverlay()` priority: bootstrap > wizard > run-update >
  manual refresh.

**M7.9 — Smoke + Verification**
- [x] End-to-end provider runner against real OpenAI-compatible endpoint.
  NanoGPT via Voidware auth, `zai-org/glm-5:thinking` default,
  `minimax/minimax-m2.7` backup, subscription models override URL, free Exa
  MCP with no API key. Wrote `changelogs/2026-04-26.md`, DB changelog row,
  run_metrics row, CSV row, and bumped `meta.last_updated`.
- [x] Schedule creation verified on this host: WSL/systemd user timer appears
  in `systemctl --user list-timers`.
- [x] "Off" state proven to disable + remove the systemd job.
- [x] Voidware visual regression across all 5 views.
  Evidence: `artifacts/m7-9/{table,chart,changelog,stats,data}.png`.
- [x] Wizard re-entry from Data tab pre-fills existing config.
  Fixed and verified `MODELS_OVERRIDE_URL` hydration plus model-step prefill
  for default/backup after connection test.

M7.9 caveats:
- macOS `launchctl` and Windows `schtasks` were not run from this WSL host.
- Exa free MCP was mounted and used as an agent tool source, but the Agents SDK
  path still does not expose per-tool call counts, so run metrics record
  `exa_searches=0` / `exa_fetches=0`.

## Nice-to-haves (post-v1)

- [ ] Sparklines of each model's score trajectory
- [ ] Diff view between any two dates
- [ ] Markdown-exportable model report
- [ ] Keyboard shortcuts (`/` search, `j/k` row nav, `e` export, `r` refresh)
- [ ] Auto-poll `meta.last_updated` every 15s; show "new data available" toast
- [ ] Agent Provider leaderboard on Stats page (cost-per-word, words-per-dollar, fastest wall-clock)
- [ ] Per-model score trend chart inside DetailPanel
