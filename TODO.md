# LLM-Dash Task Board

Short, current, and actionable. Use `[ ]` only for still-open work.

## Now

Public release CLI/install/archive architecture is shipped. Latest cut is
**v1.2.1** (catalog seed-count invariants). Next release work, when requested,
is the broader public-readiness gate: secrets/history scrub, GitHub metadata,
community files, and release notes.

Standing update-run maintenance:

- New vendor without a models.dev logo: add `web/vendor/logos/<slug>.svg` and a
  `VENDOR_LOGO` entry in `web/app.js`.
- Keep `input_capabilities` / `deprecated_on` source-backed only.
- Prefer exact per-model `card_url`s as update runs read new model cards.

## Recent Completed

- **v1.2.1 — seed-count invariants (2026-06-24).** No selectable source can
  silently seed fewer models than requested: prefetched sources count unique
  candidates and fail fast / retry once when short, Exa & custom-prompt
  discovery retry once, and final unique count must match before apply. LLM
  Stats over-fetches + de-dupes, custom endpoints accept top-level array
  `/models`, direct counts bounded 1-100. Regression coverage added; release
  suite repaired (`__version__` drift, `stop()` live-server probe).
- **v1.2.0 — unified live job console (2026-06-22..24).** Streamed the shared
  agent turn so seed *and* refresh narrate per-tool activity with phase labels,
  progress bar, parsed timeline, and 1s ticker; real `exa_searches`/`exa_fetches`
  in `run_metrics` + changelog footer (was hardcoded 0).
- **v1.1.0 — refresh/setup UX + cancel (2026-06-19..20).** Cancelable update
  runs, per-run source params, compact setup wizard, richer seed console, larger
  copyable/scrollable/resizable run window.
- **v1.0.0 — public release (2026-06-17).** `llm-dash` CLI package, installers,
  curated release archives, brand media set, autonomous E2E system.

## Completed History

- Models redesign (PR #8), setup-wizard seeding/reset overhaul, Voidware 1.1.0 +
  credential hardening, metadata/schema v4 backfill, desktop-scale polish.
- Milestone 10 — package-based Voidware vendoring + CSS rebuild.
- Phase 0-9.7 — scaffold, SQLite schema/seed, static dashboard, CSV exports,
  FastAPI server, launchers, uPlot stats, Agent Provider + Exa MCP, setup
  wizard, OS scheduling, navigation/comparison/leaderboard, SaaS polish.
