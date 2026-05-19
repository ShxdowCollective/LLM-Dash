# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

### Fresh Setup Wizard Walkthrough

Status: active headed-browser walkthrough on `http://127.0.0.1:8787`.

Done so far: reset local generated state, launched a clean seeded DB, opened a
headed `agent-browser` session, fixed Voidware broker autostart, added a narrow
keyring fallback for unavailable broker/CLI secret writes, and cleaned first-run
wizard loading so spinner and step-1 form render without shell/nav flashes or
component jumps.

Screenshot set:
`artifacts/browser-sessions/2026-05-18-fresh-wizard/`

- [ ] Finish manual wizard walkthrough through provider, model, Exa, LLM Stats,
  schedule, and summary steps.
- [ ] Run a refresh from the configured wizard flow and verify update overlay
  behavior.
- [ ] Capture final walkthrough screenshots and add the final screenshot refs to
  `LOGBOOK.md`.
- [ ] Archive/split `LOGBOOK.md` after the active walkthrough, since it is over
  the usual size threshold.

### CSS Fix Milestone — Wizard First-Run Polish

Track visual-only follow-ups here instead of mixing them into refresh/data work.

- [ ] Review the full first-run wizard at desktop and narrow widths.
- [ ] Check loading, progress, form, footer, error, and success states for
  jumps, mis-centering, clipped controls, and text overflow.
- [ ] Confirm screenshots:
  `01-wizard-connection.png`, `02-wizard-no-nav-flash.png`,
  `03-wizard-boot-spinner.png`, `04-centered-boot-spinner.png`, and
  `05-wizard-stable-step1-load.png`.
- [ ] Promote any remaining CSS-only findings into a focused fix pass.

## Recent Completed

- Phase 9.6 — Voidware 0.9.8 upgrade, workspace skill sync, route/drawer
  semantics, dashboard typography/layout polish, Agent wording, weighted
  scoring, read-only Changelog, portrait model cards, and compact Settings >
  Models.
- Phase 9.5 — SaaS UI/UX polish: sidebar icons, dense controls, bounded panels,
  settings/wizard composition, copy cleanup, and screenshot review gates.
- Phase 9.4 — Voidware provider reuse: credential discovery, metadata-only
  persistence, broker-mediated reads, 120-day grants, encrypted v3 auth
  compatibility, backend tests, and e2e screenshots.

## Completed History

- Phase 0 — Repo scaffold, agent guides, update contract, implementation plan.
- Phase 1 — SQLite schema, seed data, changelog seed, metrics CSV export.
- Phase 2 — Static dashboard frontend, filters, freshness, sql.js, vendored assets.
- Phase 3 — Models and metrics CSV exports.
- Phase 4 — FastAPI server, first-run bootstrap, prompt API, Refresh modal.
- Phase 5 — Launchers, scheduling docs, uPlot stats charts.
- Phase 6 — Agent Provider backend, update API, Exa MCP, provider presets.
- Phase 7 — Setup wizard, OS scheduling, Voidware v0.7.1 upgrade.
- Phase 8.6 — Navigation and panel polish.
- Phase 8.7 — Multi-model info comparison.
- Phase 8.8 — Runner and reset reliability.
- Phase 8.9 — Visual polish and motion pass.
- Phase 8.10 — In-app Settings backend and UI.
- Phase 8.10.1 — Voidware 0.8.3 app shell and responsive UX overhaul.
- Phase 8.11 — Optional LLM Stats enrichment and score-range schema hardening.
- Phase 8.12 — Markdown/docs contract pass.
- Phase 9.1 — Data exploration: sparklines, detail trends, compare links, reports.
- Phase 9.2 — Power-user shortcuts and visibility-aware data refresh.
- Phase 9.3 — Agent Provider leaderboard on Stats.
- Phase 9.4 — Voidware provider reuse and full app e2e screenshots.
- Phase 9.5 — SaaS UI/UX polish and final visual review gates.
- Phase 9.6 — Voidware 0.9.8 upgrade and workspace skill sync.
