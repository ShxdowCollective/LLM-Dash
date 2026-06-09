# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

Nothing active. M12 follow-ups and M13 are shipped (see below). Next data
refresh runs via [`skill/SKILL.md`](skill/SKILL.md).

Open optional follow-ups:

- [ ] Provider logos cover current vendors; add a new `<slug>.svg` + `VENDOR_LOGO`
  entry when a vendor without a models.dev logo appears (falls back to monogram).
- [ ] Capability/deprecation metadata is honest-by-default (migration backfills
  nothing; seed sets only documented multimodal models). Update runs fill the
  rest from cited primary sources over time.
- [ ] `card_url` backfill uses per-vendor official docs pages; optionally replace
  with exact per-model cards over time as update runs record them.

## Recent Completed

**Milestone 13 — Table UX, ranking, reset, and model metadata overhaul — DONE.**
Implemented all 10 items live against
[`docs/plans/2026-06-08-m13-table-ux-data-overhaul.md`](docs/plans/2026-06-08-m13-table-ux-data-overhaul.md).
Frontend (`web/`) + data layer (`scripts/`, `server.py`, `skill/`); owner
authorized. Schema → version 4. Verified: 24 Python tests pass, idempotent
migration, all reset scopes on DB copies, header-sort/zoom/grade-collapse live,
desktop 1440 + mobile 390 headed screenshots in `e2e/screenshots/m13/`, pro +
image nano-agent review.

- [x] Data layer (items 8+9): `scripts/migrate_model_metadata_v4.py` adds
  `input_capabilities` (canonical JSON text/image/audio/video) + `deprecated_on`;
  wired into server startup + `run_update` (COALESCE so runs never wipe), schema,
  seed, writer validation, full SKILL.md contract sweep. No prose backfill.
- [x] Ranking (item 3): Overall `25/25/25/10/15`, Value `60/25/15`; cost now
  counts. Distribution re-checked; documented in `docs/ARCHITECTURE.md`.
- [x] Notes guidance (item 7): SKILL.md `notes` = plain strengths/weaknesses,
  no raw benchmark numbers.
- [x] Table (items 1+2): header-click sort + `aria-sort`, real Provider column,
  pointer-drag resizable columns (persisted), zoom slider, desktop grade collapse
  below `0.85`, compact mobile sort select.
- [x] Metadata UI (items 8+9): capability icon chips in table/detail/filters +
  mobile cards, deprecation badge + date, "Ignore deprecated" toggle (Status=
  Deprecated wins), CSV export adds status/deprecated_on/capabilities.
- [x] Settings Reset tab (item 4): `POST /api/reset` scoped stats/changelog/
  models/full with server-validated typed `confirm_token`; scoped functions in
  `scripts/reset_local_state.py`; reseed/CSV/meta coherent; credentials untouched
  by construction (config is metadata-only).
- [x] Spacing/copy (items 5, 6, 10): Stats CTA top-right + freshness centered,
  "Local benchmark workbench" kicker removed, app-wide density pass (fixed the
  stretched Stats KPI cards via `align-content:start`), wider Reset panel.

**Milestone 12 follow-ups — DONE (2026-06-08).** Official `card_url` (schema +
migration, live 34/34), per-metric bar colors, 2-col capped single-model card,
fit-to-viewport shell (only the model list scrolls).

**Milestone 12 — Voidware Color Revival + Comparison Overhaul — DONE.**
All 8 items live against
[`docs/plans/2026-06-07-m12-color-revival-compare-overhaul.md`](docs/plans/2026-06-07-m12-color-revival-compare-overhaul.md):
iridescent gradient accents, checkbox multi-select (`compare` vs `inspect`),
unified `modelStatCard`, single bold title, quiet freshness chip, full filter
set, vendored provider logos, chart rescue, and the `h()` `setProperty` root fix
that made model colors actually apply.

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
