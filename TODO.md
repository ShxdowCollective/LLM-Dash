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

Goal: make every page feel intentional, stable, and easy to scan without
turning the dashboard into a confetti machine.

- [ ] Add responsive progress bars, spinners, and small loading animations
  where async work currently feels stalled or ambiguous.
- [ ] Re-audit grading/tier colors so the visible score scheme is
  spectrum-ordered and consistent across table cells, chart bars, badges, and
  model details.
- [ ] Sweep spacing and padding across all views: Table, Chart, Changelog,
  Stats, Settings, overlays, wizard, modals, filters, and model info cards.
- [ ] Ensure text does not wrap, overflow, clip, or collide in buttons, chips,
  nav, cards, tables, charts, log tails, and mobile layouts.
- [ ] Add tasteful iridescent gradient accents to key affordances and section
  boundaries where they improve hierarchy.
- [ ] Run headed browser visual checks at desktop and mobile widths, including
  screenshot evidence and an overflow/layout-shift probe.

### Phase 8.10 — In-app Settings

Goal: replace the Data page with a real Settings page that can handle normal
configuration without forcing the whole first-run wizard.

- [ ] Rename the Data nav/view to Settings while preserving the manual update
  prompt escape hatch.
- [ ] Add editable Agent Provider settings: provider preset/custom endpoint,
  endpoint mode, optional models override URL, request headers, and API key
  update flow.
- [ ] Add model configuration controls for default and backup model selection,
  manual model IDs, provider model refresh, and model test roundtrips.
- [ ] Add API-key/config sections for Exa and optional enrichment providers,
  with save/test/remove flows.
- [ ] Keep the full setup wizard for first-run onboarding and major guided
  reconfiguration, but route routine edits through Settings.
- [ ] Make Settings changes reload provider state and update Refresh behavior
  without a full page refresh.
- [ ] Verify secret redaction, failed-test messaging, keyboard flow, mobile
  layout, and no accidental provider run on save.

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
