# LLM-Dash Task Board

Rough execution order. Keep this file as the active roadmap: short, current,
and actionable. Deeper implementation notes belong in `docs/plans/`; handoff
context belongs in `LOGBOOK.md`.

Use `[x]` for done and `[ ]` for still-open.

## Active Roadmap

### Phase 8.10.1 - Voidware app shell and UX overhaul

Plan: [docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md](docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md)

Depends on: Phase 8.10 Settings backend and functionality

Voidware: `@shxdowcollective/voidware` 0.8.3

Goal: rebuild the dashboard into a polished, dense, SaaS-grade Voidware app
instead of continuing to patch the current long-scroll, over-containerized SPA.

Done checkpoints:

- [x] Write the implementation plan before coding.
- [x] Stay vanilla HTML/CSS/JS; vendor Voidware CSS as static files.
- [x] Review and harden the plan with native subagents plus a pro nanoagent.
- [x] Add full broker-backed Voidware auth requirements to the plan.

Open implementation:

- [ ] Replace sticky top navigation with a persistent app shell: left primary
  nav, compact header/status actions, stable view transitions, and no layout
  shift between views.
- [ ] Add top sub-page navigation inside primary areas. Settings becomes
  grouped pages/tabs instead of six stacked collapsible containers.
- [ ] Rework information architecture around Explore/Compare, Changelog,
  Stats, Settings, and Update/Run controls. Cut duplicate surfaces and move
  secondary tools behind predictable sub-pages.
- [ ] Rebuild Settings into compact task pages for Agent Provider, Models, Exa,
  Schedule, Manual Update, and future LLM Stats.
- [ ] Reduce card soup: use cards only for repeated items, modals, and framed
  tools; prefer workspace regions, tables, toolbars, split panes, and compact
  forms.
- [ ] Tighten typography and copy so the app reads like a polished operations
  dashboard: clearer hierarchy, less debug/admin phrasing, and less filler.
- [ ] Establish desktop, tablet, and mobile layout contracts: predictable side
  nav collapse, reachable subnav, no horizontal clipping, and no giant stacked
  button walls unless unavoidable.
- [ ] Rebuild mobile navigation/settings for thumb ergonomics: drawer or bottom
  affordance if needed, short pages, sticky save areas where appropriate, and a
  visible current location.
- [ ] Restyle table, chart, changelog, stats, detail comparison, run update,
  setup wizard, and settings views against one cohesive Voidware visual system.
- [ ] Validate with headed screenshots at desktop (1920x1080), laptop
  (1366x768), tablet (~820x1180), and mobile (390x844). Save artifacts under
  `artifacts/phase-8-10-1-app-shell/`.
- [ ] Add programmatic UI probes for overflow, clipped text, unreachable
  controls, console errors, keyboard focus order, and reduced-motion behavior.
- [ ] Update TODO/LOGBOOK after the design plan, after implementation, and
  after verification. Do not call the UI shippable until screenshots support it.

### Phase 8.11 - Optional LLM Stats enrichment

Goal: enrich update runs with structured model/catalog data from
[LLM Stats](https://docs.llm-stats.com/api-reference/introduction.md) while
keeping every score claim cited and synthesized.

- [ ] Add optional LLM Stats API-key storage using the existing secret boundary.
- [ ] Add bearer-auth connection testing against the documented Stats API base
  URL.
- [ ] Use LLM Stats to enrich model, cost, ranking, benchmark metadata, and
  update discovery during agent searches.
- [ ] Keep the update agent responsible for synthesis; every dashboard score or
  change claim still needs a URL in the changelog.
- [ ] Add optional LLM Stats setup to the wizard and status/test controls to
  Settings.
- [ ] Record whether LLM Stats enrichment was enabled or used in run metadata
  when available.

### Phase 8.12 - Docs and agent contract pass

Goal: bring every markdown surface back in sync after Settings, visual polish,
and optional data-provider work settles.

- [ ] Update `skill/SKILL.md` for current provider setup, optional enrichment,
  reset behavior, and verification requirements.
- [ ] Update README, AGENTS, CLAUDE, architecture/development docs, scheduling
  docs, and stale markdown plans that reference old Data-page or wizard-only
  configuration flows.
- [ ] Standardize Settings terminology, API-key storage, optional LLM Stats
  behavior, Exa behavior, and reset/changelog/log cleanup.
- [ ] Run a markdown link/path sanity pass.

## Active Backlog

- [ ] Add score-range schema hardening migration for `model_scores`: validate
  existing rows, rebuild with `CHECK (col BETWEEN 0 AND 10)` constraints,
  recreate indexes, and bump `meta.schema_version`.

## Nice-to-haves

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

- [x] Phase 0 - Repo scaffold, agent guides, update contract, implementation
  plan, and core project decisions.
- [x] Phase 1 - SQLite schema, seed data, changelog seed, metrics CSV export,
  and bootstrap `run_metrics` row.
- [x] Phase 2 - Static frontend with Table, Chart, Changelog, Stats, filters,
  freshness pill, sql.js loader, and vendored assets.
- [x] Phase 3 - Models and metrics CSV exports.
- [x] Phase 4 - FastAPI static server, first-run bootstrap, prompt API,
  terminal opener, and Refresh modal flow.
- [x] Phase 5 - POSIX/Windows launchers, scheduling docs, and uPlot stats
  charts.
- [x] Phase 6 - Agent Provider backend, run-update API, Exa remote MCP wiring,
  provider preset catalog, and Data tab manual prompt escape hatch.
- [x] Phase 7 - Setup wizard, OS-level scheduling, and Voidware v0.7.1 upgrade.
- [x] Phase 8.6 - Navigation and panel polish.
- [x] Phase 8.7 - Multi-model info comparison.
- [x] Phase 8.8 - Runner and reset reliability.
- [x] Phase 8.9 - Visual polish and motion pass.
- [x] Phase 8.10 - In-app Settings backend and UI.
