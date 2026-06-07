# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

No active development task is logged.

- [ ] Follow-up verification (optional): re-capture the full 22-viewport
  screenshot matrix and re-run the per-screenshot nano review for a clean-sweep
  sign-off. Capture with `agent-browser set viewport <w> <h>` before `open`
  (desktop + mobile spot-checks already verified live this way).

## Recent Completed

- Milestone 11 polish — implemented
  [`docs/plans/2026-06-06-m11-polish-implementation-plan.md`](docs/plans/2026-06-06-m11-polish-implementation-plan.md)
  end to end (A–D workstreams): radar axis-label clip fixed (reduced radius +
  quadrant-aware anchors that now actually apply), higher-contrast scatter
  points + radar fill, single border/nesting convention (child chips/pills/tiles
  de-ringed; active changelog item de-ringed), actionable+muted stale freshness
  chip, de-duped "Reset view", duplicate mobile page title hidden, internal copy
  rewritten + agent/runtime slugs humanized, Settings card capped (560px) with
  accent wash, low-data Stats consolidated to one CTA, chart value captions,
  radar X/Y selects hidden, duplicate toolbar "?" removed, toast queue cap +
  modal-aware suppression, mobile filter-row reflow, compare-card scores to
  2-col (fixed redundant nested corners). Codex review findings addressed; live
  desktop smoke verified; `?v=` bumped; benchmark data untouched.

- Milestone 11 — ground-up Voidware 1.0.4 frontend rearchitecture:
  replaced the large legacy vanilla surface with a compact zero-build
  controller and rebuilt app layer; delivered a calm Models workbench with
  sortable table, mobile cards, CSV export, scatter/radar chart, comparison
  strip, Changelog reader, Stats low-data/populated states, Settings subpages,
  drawer, toast, shortcuts, and helpful empty states. Completed the extended
  headed screenshot matrix in `e2e/screenshots/m11-redesign/`, passed visual
  nano-agent review against the Voidware checklist, and kept benchmark data
  history unchanged.
- Milestone 10 planning — imported `@shxdowcollective/voidware@1.0.1`,
  documented the package-source migration and full CSS rebuild plan, and
  replaced the old follow-up/CSS polish queue.
- Milestone 10 — package-based Voidware 1.0.1 vendoring, sectioned app CSS
  rebuild, bar-free Models chart scorecards, Settings/wizard approval fixes,
  final approval lifecycle hardening, live `.env` E2E,
  screenshot/contact-sheet review, and final verification.
- E2E UI audit — captured nine screenshots in `e2e/screenshots/`, wrote
  per-screenshot reports and final issue list under `docs/plans/e2e-analysis/`,
  and planned Milestone 11 polish.
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
