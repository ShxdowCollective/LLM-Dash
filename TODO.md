# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

### Milestone 11 — Full frontend redesign

**Status:** Plan drafted 2026-05-31. Supersedes the previous E2E UI/UX polish
follow-up; every active item from that queue is rolled into the redesign
phases below. Implementation has not started; the planning entry and plan
document are the only artifacts so far.

Active tasks:

- [ ] **Phase 1 — Tokens, scrollbars, and shell.** Add `--llm-*` tokens (tier
  colors, freshness tones, shell sizes, spacing). Custom dark-mode scrollbars.
  Rebuild sidebar, mobile header, drawer, page header rhythm. Refreshment tone
  (fresh / stale / never / error). Sidebar + drawer footer rhythm. Disabled
  state distinction.
- [ ] **Phase 2 — Models Table and toolbar.** Replace the sort chip grid
  with a sort rail + filter/search disclosure. New column structure, score
  cell with tier letter square. Compress mobile/tablet so the first model
  card is visible at `390px` and `768px`.
- [ ] **Phase 3 — Models Chart redesign.** Replace the row-based scorecard
  list with a real analysis surface: X/Y axis selectors, scatter + radar
  modes (hand-rolled interactive SVG with tabindex and arrow key support),
  legend by provider, right-side selection panel, comparison strip. Elegant shimmer
  skeleton loader. Empty / loading / mobile graceful degrade.
- [ ] **Phase 4 — Changelog polish.** Shrink one-entry rails, strip the
  duplicate markdown H1 when it matches the panel header, reduce redundant
  purple accent depth between rail and detail.
- [ ] **Phase 5 — Stats low-data states.** Action-oriented empty states for
  0 / 1 / filtered-empty / N runs. Pluralization fix (`1 run` vs
  `N runs`). Card rebalance so Words is not stranded. `—` instead of `0`
  for null fields. Chart axis contrast + description lines.
- [ ] **Phase 6 — Settings composition.** Deduplicate subpage vs card
  title. Inline action row with status chip. Form helpers and disabled
  distinction. Backup model helper line, credential label cleanup.
- [ ] **Phase 7 — Score encoding, accessibility, verification.** Tier
  letter + number on every score surface, tooltip on tier letter. Focus
  ring audit, WCAG AA contrast audit (specifically targeting `--vw-text-soft`), keyboard pass. Headed `agent-browser`
  screenshot matrix at `1280x800`, `768x600`, `1280x640`, `390x844`,
  plus drawer. `node --check web/app.js`, full Python test suite,
  `git diff --check`.

Reference:
[`docs/plans/2026-05-31-m11-full-redesign-plan.md`](docs/plans/2026-05-31-m11-full-redesign-plan.md).
The earlier polish plan is preserved for history at
[`docs/plans/2026-05-31-e2e-ui-ux-polish-implementation-plan.md`](docs/plans/2026-05-31-e2e-ui-ux-polish-implementation-plan.md).

### Milestone 10 — Voidware 1.0.1 package import and CSS rebuild

**Status:** Complete; supersedes the Phase 9.7 follow-up and paused wizard CSS
polish queue.

Active tasks:

- [x] Refresh vendored Voidware CSS from `@shxdowcollective/voidware@1.0.1`
  using a repeatable package-based script and update provenance.
- [x] Audit the Voidware runtime bridge against the 1.0.1 package exports and
  keep the app-owned approval flow working while documenting any CLI-package
  boundary.
- [x] Rebuild `web/style.css` from the ground up as a sectioned Voidware 1.0.1
  app layer.
- [x] Recompose dashboard, Settings, wizard, approval modal, dense tables,
  charts, changelog reader, loading, empty, error, and mobile drawer states.
- [x] Run the full Milestone 10 screenshot matrix at `1280x800`, `768x600`,
  `1280x640`, and mobile/drawer widths with before/after evidence for P0/P1
  fixes.
- [x] Complete package, syntax, Python, unit, and browser verification gates.

Reference: [`docs/plans/2026-05-29-milestone-10-voidware-1-0-1-rebuild.md`](docs/plans/2026-05-29-milestone-10-voidware-1-0-1-rebuild.md).

## Recent Completed

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
