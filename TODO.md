# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

**Milestone 13 — Table UX, ranking, reset, and model metadata overhaul — planned.**
Implementation plan:
[`docs/plans/2026-06-08-m13-table-ux-data-overhaul.md`](docs/plans/2026-06-08-m13-table-ux-data-overhaul.md).
No implementation has started yet.

- [ ] M13 data layer: `scripts/migrate_model_metadata_v4.py` for
  `input_capabilities` and `deprecated_on`; wire migration into startup/update
  paths; update schema, seeds, writer validation, and the full update contract.
- [ ] M13 ranking formula: implement researched weights
  (`25/25/25/10/15` Overall, `60/25/15` Value), document in architecture, and
  verify tier/filter distribution before/after.
- [ ] M13 table UX: header-click sorting, real Provider column, resizable
  columns, compact mobile sort, zoom slider, and desktop grade-letter collapse
  below zoom `0.85`.
- [ ] M13 metadata UI: capability icons in table/chart/detail, capability
  filters, deprecation date display, and "Ignore Deprecated Models" toggle.
- [ ] M13 Settings Reset tab: scoped stats/changelog/models/full reset with
  server-validated typed `confirm_token`, coherent reseed/CSV/meta behavior,
  and Voidware credential preservation verification.
- [ ] M13 spacing/copy cleanup: move Stats single-run CTA top-right, center
  freshness under Refresh, remove "Local benchmark workbench", tighten empty
  space, and update notes guidance to avoid raw benchmark numbers.
- [ ] M13 verification/docs: migration/reset tests, Voidware `1.0.4` verification
  + auth-secret checks, headed desktop/mobile screenshots, CSV export check,
  docs/TODO/LOGBOOK updates.

Optional Milestone 12 follow-ups:

- [ ] Provider logos cover current vendors; add new `<slug>.svg` + a `VENDOR_LOGO`
  entry when a vendor without a models.dev logo appears (falls back to monogram).
- [ ] `card_url` backfill uses per-vendor official docs pages; the daily update
  records exact per-model URLs going forward. Optionally replace seed/back­filled
  vendor pages with exact per-model cards over time.
- [ ] Follow-up verification (optional): re-capture the full 22-viewport
  screenshot matrix and re-run the per-screenshot nano review for a clean-sweep
  sign-off. Capture with `agent-browser set viewport <w> <h>` before `open`
  (desktop + mobile spot-checks already verified live this way).

### M12 follow-ups shipped (2026-06-08)

- [x] D1 — official `card_url`: schema column + view + migration (live DB 34/34),
  `init_db`/`run_update` writers, SKILL.md doc, frontend "Model card ↗" link.
- [x] Per-metric bar colors in the detail view (distinct iridescent hue each).
- [x] Single-model card redesigned to 2-col, capped width (no full-bleed/cutoff).
- [x] Fit-to-viewport shell: no page vertical scrollbar; only the model list
  scrolls; chart scales; verified desktop 1440 + mobile 390.

## Recent Completed

**Milestone 12 — Voidware Color Revival + Comparison Overhaul — DONE.**
Implemented all 8 items live against
[`docs/plans/2026-06-07-m12-color-revival-compare-overhaul.md`](docs/plans/2026-06-07-m12-color-revival-compare-overhaul.md).
Frontend-only (`web/`); owner authorized the `web/` change. Verified with
desktop (1440) + mobile (390) headed screenshots in `e2e/screenshots/m12/`,
effective-state checks (`getComputedStyle`), and a clean-localStorage reload.

- [x] 1 — Color revival: iridescent gradient accents (sidebar, buttons, subnav,
  brand), contrast lift, hover/active states, model-color-mapped rows/points/cards.
- [x] 2 — Right-side checkbox multi-select; `compare` (multi, empty default) vs
  `inspect` (single click) split; prefs migration; shared `renderCompareArea()`.
- [x] 3 — Unified `modelStatCard`: bars (single) / grade boxes (multi), full
  metadata (provider, cost, released, tracked-since, type, notes, card link);
  rounded corners + gradient top stripe.
- [x] 4 — Single bold page title; eyebrow/lead removed; mobile kicker dropped.
- [x] 5 — Freshness chip demoted to quiet gray `Last update: <age>`, no CTA.
- [x] 6 — Filters: tier, status, min-overall slider, has-pricing, released-after,
  multi-vendor chips; `filterCount`/`resetFilters`/`DEFAULT_UI` updated.
- [x] 7 — Provider logos vendored from models.dev under `web/vendor/logos/`
  (+ `SOURCE.md`); render in table, mobile cards, stat cards, filter + legend.
- [x] 8 — Chart rescue: lifted plot bg + brighter grid, colored points with
  inspect/compare glow, colored clickable legend filtering by vendor.
- [x] Root fix — `h()` now sets CSS custom properties via `setProperty`; model
  colors had never actually applied (this is why chart points were black).

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
