# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

### Phase 9.6 — Voidware 0.9.8 Upgrade

Plan: [docs/plans/2026-05-17-phase-9-6-voidware-0-9-8-upgrade.md](docs/plans/2026-05-17-phase-9-6-voidware-0-9-8-upgrade.md)

Done: vendored Voidware `0.9.8` CSS/provenance, synced stale `voidware-spec`
skill mirrors across WSL/Windows/remote workspaces, aligned route/drawer
semantics with the current spec, fixed the mobile drawer close affordance and
table overflow cue found by visual review, moved the app body/display typography
to a Roboto-first sans stack, kept model list/chart names on the UI font, and
reserved monospace treatment for compact numeric score/rank values where
tabular scanning matters, plus the selected model detail title; constrained
table lanes collapse score bars to tier letters and numeric values instead of
showing horizontal scroll; the desktop shell now spans the viewport with the
sidebar pinned left so chart/table views can use widescreen room; Models chrome
is tightened with no redundant subtitles, icon-only CSV download, and combined
Advanced Filters/Search controls. Follow-up: Models now uses Agent wording,
weighted Overall/Value scoring, and a compact scoring tooltip next to CSV
export. Follow-up: Changelog is read-only again with no Compare tab, the main
Models table no longer has a Trend column/sort path, Dashboard portrait layout
uses model cards at 1080x1920, and Settings > Models is centered in a compact
form.

### Phase 9.4 — Voidware Provider Reuse

Plan: [docs/plans/2026-05-09-phase-9-4-voidware-provider-reuse.md](docs/plans/2026-05-09-phase-9-4-voidware-provider-reuse.md)

Done: redacted provider discovery, wizard/settings credential selection,
metadata-only persistence, broker-mediated secret reads, 120-day grant tracking,
encrypted Voidware v3 auth compatibility, focused backend tests for those
contracts, and the setup wizard/dashboard/settings e2e screenshot pass.

### Phase 9.5 — SaaS UI/UX Polish

Plan: [docs/plans/2026-05-10-polished-saas-ui-ux-plan.md](docs/plans/2026-05-10-polished-saas-ui-ux-plan.md)

Audit: [docs/plans/e2e-analysis/master-issue-list.md](docs/plans/e2e-analysis/master-issue-list.md)

Done: implemented the polished UI/UX pass with sidebar icons, denser controls,
bounded dashboard panels, settings and wizard composition, full copy cleanup
away from `Model Ops`/ops phrasing, and final native/nano/blind screenshot
reviews.

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
