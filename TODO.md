# TODO

# LLM-Dash Task Board

Rough execution order. Read open roadmap phases top-to-bottom.

Use `[x]` for done and `[ ]` for still-open. Keep this file as the active
roadmap; deeper implementation notes belong in `docs/plans/` and handoff
context belongs in `LOGBOOK.md`.

## Active Roadmap

### Phase 8.6 — Navigation and panel polish

> Plan: [docs/plans/M8_6_NAVIGATION_POLISH_PLAN.md](docs/plans/M8_6_NAVIGATION_POLISH_PLAN.md)

Goal: stabilize the app chrome between views and tighten common controls.

- [x] Replace the shifting Table / Chart / Changelog / Stats / Data nav with a
  simple top-bar navigation menu that stays put while switching views.
- [x] Make collapsible surfaces toggle from the whole component/header click
  target instead of a separate text Collapse button.
- [x] Use icon-only collapse/expand affordances where a visual state indicator
  is still needed.
- [x] Add an icon to the Refresh button.
- [x] Replace Reset filters button text with an icon affordance.
- [x] Verify the five primary views for nav stability, pointer targets,
  tooltips/ARIA labels, and no layout shift.

### Phase 8.7 — Multi-model info comparison

> Plan: [docs/plans/M8_7_MULTI_MODEL_COMPARISON_PLAN.md](docs/plans/M8_7_MULTI_MODEL_COMPARISON_PLAN.md)

Goal: let the dashboard compare several selected models without bouncing
between single-card detail views.

- [x] Allow up to 5 model info cards/windows to be open at once.
- [x] Opening another model adds it to the existing model info area and splits
  the selected cards into one row.
- [x] Add a predictable max-count behavior when a sixth model is selected
  (block with feedback or replace the oldest card).
- [x] Preserve collapse/expand state and provide an obvious way to close an
  individual model info card.
- [x] Verify desktop and mobile behavior for overflow, text fit, keyboard
  focus, and row layout.

### Phase 8.8 — Runner and reset reliability

> Plan: [docs/plans/M8_8_RUNNER_RESET_RELIABILITY_PLAN.md](docs/plans/M8_8_RUNNER_RESET_RELIABILITY_PLAN.md)

Goal: make local update/reset flows match the app's real-world cleanup and
tooling needs.

- [x] Fix the Exa MCP run failure shown in logs:
  `exa_mcp_runtime_error=MaxTurnsExceeded: Max turns (10) exceeded`.
- [x] Update `--reset` so it also purges app run logs, in addition to
  provider config, schedule state, SQLite, and CSV data.
- [x] Keep `changelogs/*.md` append-only during reset; the audit trail is not
  a disposable generated artifact.
- [x] Document and verify the expanded reset behavior so the destructive scope
  is obvious before anyone hits it.

### Phase 8.9 — Visual polish and motion pass

> Plan: [docs/plans/M8_9_VISUAL_POLISH_PLAN.md](docs/plans/M8_9_VISUAL_POLISH_PLAN.md)

Goal: make every page feel intentional, stable, and easy to scan without
turning the dashboard into a confetti machine.

- [x] Add loading skeletons and view-transition crossfades: DB-loading skeleton
  cards below `.bootstrap-spinner`, changelog body pulse placeholder, double-
  `requestAnimationFrame` view switch fade on `.view-slot` (`#view`), filter chip
  `:active` scale, table row hover inset glow. 300ms minimum skeleton display
  to avoid flash on fast loads.
- [x] Refactor `barColor()` (app.js:249) and `CHART_BARS` (app.js:24) from
  hardcoded hex to `var(--vw-iridescent-N)` references. Add `resolveCSSVar()`
  helper called at render time (not init) for uPlot canvas contexts. Create
  a single `TIER_COLOR_MAP` lookup used by tier pills, `barColor()`, and
  any future tier→color mapping.
- [x] Introduce `--vw-space-*` tokens (xs=4px through 3xl=32px) in `:root`
  (these don't exist yet) and sweep spacing across all views. Key targets:
  filter grid gap → `--vw-space-lg`, score cells → `clamp(120px, 15vw, 144px)`,
  changelog body → `max-inline-size: 65ch`, mobile sort controls → horizontal
  scrollable chip strip with `scroll-snap-type: x mandatory`.
- [x] Fix text overflow on 4 exposed surfaces: detail panel title `h2`
  (ellipsis + `max-width: 100%`), changelog body `overflow-wrap: break-word`,
  `.vw-btn` truncation modifier, and filter chip labels (`max-width: 160px`).
  Add mobile `.view-slot { overflow-x: hidden }` guard.
- [x] Add iridescent gradient accents: active nav `::after` underline glow,
  collapsed `.panel-shell` bottom hairline (use `rgba()` not `color-mix()`),
  score bar `linear-gradient` fills, wizard step dot+connector indicators,
  and stale Refresh button `accent-pulse` animation (>24h since
  `state.lastUpdated` → `dataset.stale` attribute).
- [x] Create `switchView()` wrapper in app.js replacing the direct
  `state.view` assignment at ~line 3513. Wire nav button click handler to
  call `switchView(btn.dataset.view)` for the fade transition.
- [x] Run headed browser visual checks at desktop (1920×1080) and mobile
  (390×844) widths — 20-point checklist in the plan. Save screenshots to
  `artifacts/phase-8-9-verification/`.

### Phase 8.10 — In-app Settings

> Plan: [docs/plans/M8_10_IN_APP_SETTINGS_PLAN.md](docs/plans/M8_10_IN_APP_SETTINGS_PLAN.md)
> Depends on: Phase 8.9 (spacing tokens, panel affordances)
> UI status: functional but not shippable. Superseded by Phase 8.10.1.

Goal: replace the Data page with a real Settings page that can handle normal
configuration without forcing the whole first-run wizard.

- [x] Backend: add `_delete_keyring_secret()`, `_delete_auth_file_secret()`,
  `remove_exa_api_key()`, and `remove_provider_api_key()` to config.py.
  Add `DELETE /api/exa` and `DELETE /api/provider/key` endpoints to server.py.
- [x] Rename Data nav label to "Settings" (keep `state.view = "data"` and
  `#data` hash internally; accept `#settings` alias). Rename
  `renderDataView()` → `renderSettingsView()`. Add settings gear icon to
  the icon lookup table.
- [x] Build 6-section Settings layout using `.panel-shell` collapsible
  sections: Agent Provider, Models, Exa, LLM Stats (reserved/disabled),
  Schedule, Manual Update (collapsed).
- [x] Wire provider/Exa save to reload `state.provider` via `fetchProvider()`
  without a full page refresh. Pre-populate fields from current state via
  draft state so partial edits survive re-renders. Empty API key = keep
  existing key.
- [x] Remove "Reconfigure" / "Manage Schedule" wizard entry buttons from
  Settings. Keep wizard for first-run only. Show "Agent Provider not
  configured → Run Setup Wizard" banner when `!state.provider.has_provider`.
- [x] Verify: syntax checks pass, Codex review completed with fixes for
  draft state persistence, preset field names, test connection POST,
  model_count field name, schedule button class conflict, and mobile
  password toggle width.

### Phase 8.10.1 — Voidware app shell and UX overhaul

> Plan: [docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md](docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md)
> Depends on: Phase 8.10 (Settings backend + functionality)
> Voidware: @shxdowcollective/voidware 0.8.3

Goal: rebuild the dashboard experience into a polished, dense, SaaS-grade
Voidware app instead of continuing to patch the current long-scroll,
over-containerized single-page layout.

- [x] Write a fresh implementation plan in
  `docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md` before coding. Treat the
  current UI as implementation substrate, not design direction.
- [x] Decide whether to keep vanilla HTML/CSS/JS or migrate to a lightweight
  build stack. External dependencies are allowed if they measurably improve
  maintainability, layout quality, accessibility, routing, charts, or component
  behavior. **Decision: stay vanilla. Vendor voidware CSS as static files.**
- [x] Review the 8.10.1 plan with native subagents plus a pro nanoagent pass.
  Tighten routing, Settings safety, accessibility, verification, docs sync,
  and implementation ownership before app-shell coding starts.
- [x] Update the 8.10.1 plan for Voidware 0.8.3 and full broker-backed
  Voidware auth: provider/Exa secrets use a local broker permission grant,
  durable grant status is surfaced, legacy secrets become migration sources,
  and grant/secret values stay out of UI, logs, config, and API responses.
- [ ] Replace the sticky top navigation with a real app shell: persistent left 
  side navigation for primary areas, compact header/status actions, and no
  layout shift between views.
- [ ] Add top sub-page navigation inside each primary area. Settings should
  become grouped pages/tabs instead of six stacked collapsible containers.
- [ ] Redesign information architecture around common workflows:
  Explore/Compare, Changelog, Stats, Settings, and Update/Run controls. Cut
  duplicate surfaces and move secondary tools behind predictable sub-pages.
- [ ] Eliminate long-scroll Settings. Agent Provider, Models, Exa, Schedule,
  Manual Update, and future LLM Stats should fit into compact, task-focused
  pages with clear save/test/remove affordances.
- [ ] Reduce over-containerization. Use cards only for repeated items, modals,
  and genuinely framed tools; prefer unframed workspace regions, tables,
  toolbars, split panes, and compact forms.
- [ ] Rework typography and copy so the app reads like a polished operations
  dashboard: fewer mono labels, clearer hierarchy, less debug/admin phrasing,
  no awkward explanatory filler in the main UI.
- [ ] Establish a real responsive layout contract for desktop, tablet, and
  mobile: side nav collapses predictably, top subnav remains reachable, no
  horizontal clipping, no giant stacked button walls unless unavoidable.
- [ ] Rebuild mobile navigation and settings flows for thumb ergonomics:
  compact drawer/bottom affordance if needed, short pages, sticky save areas
  where appropriate, and visible current location.
- [ ] Audit and restyle table, chart, changelog, stats, detail comparison, run
  update, setup wizard, and settings views against one cohesive Voidware visual
  system instead of piecemeal phase patches.
- [ ] Validate the overhaul with headed browser screenshots at desktop
  (1920×1080), laptop (1366×768), tablet (~820×1180), and mobile (390×844).
  Save artifacts under `artifacts/phase-8-10-1-app-shell/`.
- [ ] Add programmatic UI probes for overflow, clipped text, unreachable
  controls, console errors, keyboard focus order, and reduced-motion behavior.
- [ ] Update TODO/LOGBOOK after the design plan, after implementation, and
  after verification. Do not call the UI shippable until screenshots support it.

### Phase 8.11 — Optional LLM Stats enrichment

Goal: optionally enrich update runs with structured model/catalog data from
[LLM Stats](https://docs.llm-stats.com/api-reference/introduction.md) while
keeping score claims cited and synthesized.

- [ ] Add an optional LLM Stats API key field using the existing secret storage
  boundary; never expose the key in API responses, logs, changelogs, or UI
  traces.
- [ ] Add connection testing against the LLM Stats API using bearer auth and
  the documented Stats API base URL.
- [ ] Use LLM Stats data as an enrichment source for new models, costs,
  rankings, benchmark metadata, and recent updates during agent searches.
- [ ] Keep the update agent responsible for synthesis: LLM Stats can guide and
  cross-check searches, but every dashboard score/change claim still needs a
  URL in the changelog.
- [ ] Update the setup wizard to offer LLM Stats as an optional data-enrichment
  step alongside Exa.
- [ ] Surface LLM Stats configuration/test status in Settings.
- [ ] Record whether LLM Stats enrichment was enabled/used in run metadata when
  available.

### Phase 8.12 — Full docs and agent contract pass

Goal: bring every markdown surface back in sync after the Settings, visual
polish, and optional data-provider work settles.

- [ ] Update `skill/SKILL.md` so the daily update contract reflects current
  provider setup, optional enrichment sources, reset behavior, and verification
  requirements.
- [ ] Update README, AGENTS, CLAUDE, architecture/development docs, scheduling
  docs, and any remaining markdown plans that reference old Data-page or
  wizard-only configuration flows.
- [ ] Make docs consistent on "Settings" terminology, API-key storage,
  optional LLM Stats behavior, Exa behavior, and reset/changelog/log cleanup.
- [ ] Run a link/path sanity pass across markdown files.

## Active Backlog

- [ ] Add score-range schema hardening migration for `model_scores`.
  Validate existing rows, rebuild the table with `CHECK (col BETWEEN 0 AND 10)`
  constraints, recreate indexes, and bump `meta.schema_version`.

## Nice-to-haves (post-v1)

- [ ] Sparklines of each model's score trajectory.
- [ ] Diff view between any two dates.
- [ ] Markdown-exportable model report.
- [ ] Keyboard shortcuts (`/` search, `j/k` row nav, `e` export, `r` refresh).
- [ ] Auto-poll `meta.last_updated` every 15s and show a "new data available"
  toast.
- [ ] Agent Provider leaderboard on Stats page: cost-per-word,
  words-per-dollar, fastest wall-clock.
- [ ] Per-model score trend chart inside DetailPanel.

## Completed History

- [x] Phase 0 — Repo scaffold, agent guides, SKILL.md update contract,
  implementation plan, and core project decisions.
- [x] Phase 1 — SQLite schema, seed data, changelog seed, metrics CSV export,
  and bootstrap run_metrics row.
- [x] Phase 2 — Static frontend: Table, Chart, Changelog, Stats, filters,
  freshness pill, sql.js loader, and vendored assets.
- [x] Phase 3 — Models and metrics CSV exports.
- [x] Phase 4 — FastAPI static server, first-run bootstrap, prompt API,
  terminal opener, and Refresh modal flow.
- [x] Phase 5 — POSIX/Windows launchers, scheduling docs, and uPlot stats
  charts.
- [x] Phase 6 — Agent Provider backend, run-update API, Exa remote MCP wiring,
  provider preset catalog, and Data tab manual prompt escape hatch.
- [x] Phase 7 — Setup wizard, OS-level scheduling, and Voidware v0.7.1 upgrade.
- [x] Phase 8 — UI polish: Voidware typography, collapsible pre-leaderboard
  panels, persisted collapse state, chart font alignment.
- [x] Phase 8.1 — Silent background launcher: `--silent`, detached uvicorn,
  logs under `logs/server.log`, readiness polling, LAN host support.
- [x] Phase 8.2 — Windows UNC launcher fix: `run.bat` delegates WSL UNC paths
  through `wsl.exe`.
- [x] Phase 8.3 — Launcher reset mode: `--reset` clears provider config,
  schedule state, generated SQLite/CSV data, and opens setup.
- [x] Phase 8.4 — Wizard spacing polish: Advanced section and nearby form/card
  spacing cleaned up, with headed browser screenshots.
- [x] Phase 8.5 — Refresh transition flicker: neutral first paint, immediate
  setup wizard overlay, immediate run-update overlay, verified transition
  smokes.
