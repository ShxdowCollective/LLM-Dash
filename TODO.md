# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

### Milestone 10 — Voidware 1.0.1 package import and CSS rebuild

**Status:** Planned; supersedes the Phase 9.7 follow-up and paused wizard CSS
polish queue.

Active tasks:

- [x] Refresh vendored Voidware CSS from `@shxdowcollective/voidware@1.0.1`
  using a repeatable package-based script and update provenance.
- [x] Audit the Voidware runtime bridge against the 1.0.1 package exports and
  keep the app-owned approval flow working while documenting any CLI-package
  boundary.
- [ ] Rebuild `web/style.css` from the ground up as a sectioned Voidware 1.0.1
  app layer.
- [ ] Recompose dashboard, Settings, wizard, approval modal, dense tables,
  charts, changelog reader, loading, empty, error, and mobile drawer states.
- [ ] Run the full Milestone 10 screenshot matrix at `1280x800`, `768x600`,
  `1280x640`, and mobile/drawer widths with before/after evidence for P0/P1
  fixes.
- [ ] Complete package, syntax, Python, unit, and browser verification gates.

Reference: [`docs/plans/2026-05-29-milestone-10-voidware-1-0-1-rebuild.md`](docs/plans/2026-05-29-milestone-10-voidware-1-0-1-rebuild.md).

## Recent Completed

- Milestone 10 planning — imported `@shxdowcollective/voidware@1.0.1`,
  documented the package-source migration and full CSS rebuild plan, and
  replaced the old follow-up/CSS polish queue.
- Phase 9.7 follow-up — Auth workflow optimization: chained-approval
  compatibility guard, shared pending-detection helper, target-safe grant
  responses, approval modal countdown/auto-focus/Enter-key/spinner/retry,
  assertive ARIA errors, and is-submitting visual feedback.
- Phase 9.7 — Voidware 0.9.10 app-owned saved-credential approval bridge,
  official durable grant cache, approval modal, docs, and backend tests.
- Phase 9.7 follow-up — New-key provider saves now surface app-owned Voidware
  approval instead of false success, then resume config save after approval.
- Phase 9.7 follow-up — OpenTabs screenshots captured for saved-key and new-key
  approval modals; wizard/settings credential chips now use user-facing labels.
- Phase 9.7 follow-up — Saved-key approval completed through the wizard, new-key
  write approval completed through the app-owned modal, stale/expired approval
  requests now auto-close with recovery copy, and app config stayed secret-free.
- Phase 9.7 follow-up — Settings renewal and broker-conflict copy verified with
  OpenTabs fixtures; confirmed stop for conflicting background access is wired;
  legacy keyring fallback is now read/migration-only and new secret writes
  require Voidware approval.
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
- Phase 9.7 — Voidware 0.9.10 app-owned approval bridge.
