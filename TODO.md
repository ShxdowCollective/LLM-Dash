# LLM-Dash Task Board

Rough execution order. Keep this file as the active roadmap: short, current,
and actionable. Per-checkpoint detail lives in `LOGBOOK.md` and the per-phase
plans under `docs/plans/`. Handoff context belongs in `LOGBOOK.md`.

Use `[x]` for done and `[ ]` for still-open.

## Active Roadmap

### Phase 9.4 — Voidware provider reuse blockers

Goal: make the setup wizard and Agent Provider settings use existing
Voidware-managed AI provider credentials instead of forcing users to paste a
new API key into LLM-Dash.

Blocked by Voidware support for durable broker/session reuse that can satisfy
the intended "enter auth password once, reuse for up to 120 days" flow.

- [ ] Add a redacted provider discovery endpoint that reads Voidware auth
  metadata and filters to reusable HTTP AI providers with `baseURL`.
- [ ] Add wizard/settings UI for selecting an existing Voidware provider
  credential, showing only redacted metadata and non-secret provider fields.
- [ ] Store the selected credential name plus non-secret model/base URL config;
  do not copy raw secrets into LLM-Dash config or logs.
- [ ] Request scoped broker access for the selected provider secret with a
  120-day TTL, track expiration, and prompt for renewal at the 90-day mark.
- [ ] Replace the plaintext legacy auth-file fallback with a Voidware v3-aware
  path; current encrypted `encryptedSecret` entries are invisible to the
  LLM-Dash loader.
- [ ] Re-run the setup wizard e2e screenshot pass after provider reuse is
  functional.

### Phase 8.12 — Docs and agent contract pass

Plan: [docs/plans/2026-05-08-phase-8-12-docs-pass-nanoagent-plan.md](docs/plans/2026-05-08-phase-8-12-docs-pass-nanoagent-plan.md)

Goal: bring every Markdown surface back in sync after Phase 8.10.1 (Voidware
app shell), Phase 8.10 (in-app Settings), and Phase 8.11 (optional LLM Stats
enrichment + score-range schema hardening) settled.

- [x] Update `skill/SKILL.md`: switch architecture reference to `docs/ARCHITECTURE.md`
  and note the schema's CHECK-enforced 0–10 score range.
- [x] Update `docs/ARCHITECTURE.md`: add Schema Versioning subsection, reflect
  `/api/llmstats` in the Settings view row, and refresh the Key Design
  Decisions credential store row.
- [x] Update `docs/DEVELOPMENT.md`: add `voidware_auth.py` and
  `migrate_score_checks.py` to the backend table; rewrite Schema Changes to
  point at the existing migration as the canonical example.
- [x] Update `README.md`: surface `voidware_auth.py` and
  `migrate_score_checks.py` in the Project Layout.
- [x] Update `docs/scheduling.md`: drop the "Phase 7 once it lands" framing
  and document the OS-level scheduled job as the supported path.
- [x] Update `docs/update_dashboard.md`: add an Optional Enrichment note
  pointing at LLM Stats and the `run_metrics.notes` flag.
- [x] Polish `.github/ISSUE_TEMPLATE/bug_report.md` Python version prompt.
- [x] Condense `TODO.md`: collapse Phase 8.10.1 / 8.11 done checkpoints into
  Completed History and promote nice-to-haves to Phase 9.x milestones.
- [x] Markdown link/path sanity pass over the in-scope docs.
- [x] Codex final review sweep + main-agent diff review.

## Active Backlog

- [ ] Add focused tests for Voidware auth discovery, selected-provider
  persistence, broker renewal state, and v3 encrypted auth compatibility.
- [ ] Keep screenshot artifacts under `e2e/screenshots/` and ensure the path is
  gitignored before the next headed e2e run.

## Completed History

- [x] Phase 0 — Repo scaffold, agent guides, update contract, implementation
  plan, and core project decisions.
- [x] Phase 1 — SQLite schema, seed data, changelog seed, metrics CSV export,
  and bootstrap `run_metrics` row.
- [x] Phase 2 — Static frontend with Table, Chart, Changelog, Stats, filters,
  freshness pill, sql.js loader, and vendored assets.
- [x] Phase 3 — Models and metrics CSV exports.
- [x] Phase 4 — FastAPI static server, first-run bootstrap, prompt API,
  terminal opener, and Refresh modal flow.
- [x] Phase 5 — POSIX/Windows launchers, scheduling docs, and uPlot stats
  charts.
- [x] Phase 6 — Agent Provider backend, run-update API, Exa remote MCP wiring,
  provider preset catalog, and Data tab manual prompt escape hatch.
- [x] Phase 7 — Setup wizard, OS-level scheduling, and Voidware v0.7.1
  upgrade.
- [x] Phase 8.6 — Navigation and panel polish.
- [x] Phase 8.7 — Multi-model info comparison.
- [x] Phase 8.8 — Runner and reset reliability.
- [x] Phase 8.9 — Visual polish and motion pass.
- [x] Phase 8.10 — In-app Settings backend and UI.
- [x] Phase 8.10.1 — Voidware 0.8.3 app shell and UX overhaul: persistent
  side nav, grouped Settings sub-pages, responsive desktop/tablet/mobile
  contracts, and verified screenshot/UI-probe artifacts under
  `artifacts/phase-8-10-1-app-shell/`.
- [x] Phase 8.11 — Optional LLM Stats enrichment plus `model_scores` 0–10
  CHECK-constraint migration and `meta.schema_version` bump to 2.
- [x] Phase 9.1 — Data exploration: inline-SVG sparklines on the Table view,
  per-model multi-series uPlot trend chart in the DetailPanel
  (`state.detailUplots` kept separate from Stats), Compare tab inside
  `renderChangelog()` with hash-state share-links, and a Markdown
  single-model report export with citation extraction.
  ([plan](docs/plans/2026-05-08-phase-9-1-data-exploration.md))
- [x] Phase 9.2 — Power-user UX: single global keydown handler with
  `/`/`j`/`k`/`e`/`r`/`?` shortcuts and modal/wizard/drawer guards,
  `GET /api/meta` declared before the `/` static mount, and a 15-s
  visibility-aware poll that surfaces a "new data available" toast which
  swaps state in place via `reloadDB()`.
  ([plan](docs/plans/2026-05-08-phase-9-2-power-user-ux.md))
- [x] Phase 9.3 — Agent Provider leaderboard on the Stats page: cost-per-word,
  words-per-dollar, and `min(duration_sec)` grouped by
  `(agent_name, agent_runtime)`, with `n ≥ 3` discipline gating for
  fastest-run, NULL-safe cost math, a `formatMicroCost` helper, and sort
  state persisted via `UI_STATE_KEY`.
  ([plan](docs/plans/2026-05-08-phase-9-3-stats-leaderboard.md))
