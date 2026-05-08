# LLM-Dash Task Board

Rough execution order. Keep this file as the active roadmap: short, current,
and actionable. Per-checkpoint detail lives in `LOGBOOK.md` and the per-phase
plans under `docs/plans/`. Handoff context belongs in `LOGBOOK.md`.

Use `[x]` for done and `[ ]` for still-open.

## Active Roadmap

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

(empty — open work is grouped under Phase 9.x below.)

## Phase 9 — Trend, comparison, and reporting surfaces

Goal: the dashboard already shows *current* state well. Phase 9.x makes it
useful for comparing across time and sharing results.

### Phase 9.1 — Data exploration

- [ ] Sparklines of each model's score trajectory in the Table view.
- [ ] Per-model score trend chart inside the DetailPanel.
- [ ] Diff view between any two changelog dates.
- [ ] Markdown-exportable single-model report (frontmatter + score history +
  citations pulled from changelog notes).

### Phase 9.2 — Power-user UX

- [ ] Keyboard shortcuts: `/` search, `j/k` row nav, `e` export, `r` refresh.
- [ ] Auto-poll `meta.last_updated` every ~15s and show a "new data
  available" toast that swaps the active state without a page reload.

### Phase 9.3 — Stats page enrichment

- [ ] Agent Provider leaderboard on the Stats page: cost-per-word,
  words-per-dollar, fastest wall-clock, grouped by `agent` and
  `agent_runtime`.

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
