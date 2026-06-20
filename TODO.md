# LLM-Dash Task Board

Short, current, and actionable.

Use `[ ]` only for still-open work.

## Now

Public release CLI/install/archive architecture is implemented. Next release
work, when requested, is the broader public-readiness gate: secrets/history
scrub, GitHub metadata, community files, and release notes.

Standing update-run maintenance:

- New vendor without a models.dev logo: add `web/vendor/logos/<slug>.svg` and a
  `VENDOR_LOGO` entry in `web/app.js`.
- Keep `input_capabilities` / `deprecated_on` source-backed only.
- Prefer exact per-model `card_url`s as update runs read new model cards.

## Recent Completed

- **Seed console verbosity — DONE (2026-06-19).** Added richer seed-job
  lifecycle log events, replaced the always-visible raw setup console with
  scan-friendly summary rows, and moved the expanded redacted terminal output
  behind a disclosure. Followed up with candidate-level seed log rows and
  centered short wizard completion states.
- **Refresh options and run window — DONE (2026-06-19).** Reworked Refresh to
  choose the same discovery sources as setup seeding, pass source context into
  the update agent, and show a larger animated run window with copyable,
  scrollable, resizable logs plus cancel controls.
- **Setup wizard compact pass — DONE (2026-06-19).** Reworked first-launch
  Research and Catalog into compact subtabs, moved helper copy into tooltips,
  and verified every wizard step fits short desktop and mobile viewports without
  scrolling. Added stronger busy/success/fail test-button feedback and cleared
  stale test results when credentials change.
- **Release media banner correction — DONE (2026-06-17).** Re-exported
  corrected LLM-Dash banners from the shxdowdesign asset library: centered
  logo/text/highlight lockups across repo/app/dark/SVG variants, with a real
  dark-mode recomposition instead of a dimmed neutral image.
- **Release media export — DONE (2026-06-16).** Generated the canonical
  LLM-Dash media set in the shxdowdesign asset library and exported the
  release-ready copies to `assets/brand/`: app icon PNG/ICO, app logo PNG,
  app/repo banners, dark repo banner, and SVG banner wrappers.
- **Public release CLI/install/archive implementation — DONE (2026-06-15).**
  Shipped the `llm-dash` Python console package,
  `start`/`stop`/`status`/`reset`/`doctor`,
  `.llm-dash/server.json` process state, idempotent POSIX/Windows installers,
  local/PATH shims, curated release archives + checksums, and docs migration off
  `run.sh`/`run.bat`. Verified archive extract/install/start/status/stop on
  Linux/WSL, Windows, and macOS.
- **Public release CLI architecture plan — DONE (2026-06-15).** Planned the
  `llm-dash` command surface, cross-platform installers, release archive
  builder, docs updates, and smoke matrix. No implementation.
- **Post-merge follow-up close-out — DONE (2026-06-15).** Validated
  `audit:fix`, reviewed/regenerated List/Table visual baselines, and live-smoked
  seed preset candidate fetchers. 72/72 Playwright green.
- **Autonomous E2E system — DONE (2026-06-14, PR #9).** Added deterministic
  Playwright coverage, visual baselines, axe checks, and a local audit loop.
- **Models redesign — DONE (2026-06-14, PR #8).** Shipped the detail rail,
  rebuilt List/Table/Chart surfaces, compare overlay, filters popover, and
  unified metric colors; followed with dead CSS cleanup.
- **Setup wizard seeding + reset overhaul — DONE (2026-06-13).** Added
  no-auto-seed first run, catalog seed jobs, AA slot, guided setup, reset
  behavior, compact List default, and tests.
- **Voidware 1.1.0 + credential hardening — DONE (2026-06-10 to 2026-06-12).**
  Upgraded package-native Voidware usage, ref-aware credential discovery and
  mutation, grant-cache cleanup, reset UX, and broker-grant handling.
- **Milestones 11-13 — DONE (2026-06-08 to 2026-06-09).** Completed the
  Voidware app redesign, model metadata/schema upgrades, ranking/table UX,
  desktop scale polish, install-over auth retention fix, and metadata backfill.

## Completed History

- Phase 0–5 — scaffold, SQLite schema/seed, static dashboard, CSV exports,
  FastAPI server, launchers, uPlot stats.
- Phase 6–7 — Agent Provider backend, Exa MCP, setup wizard, OS scheduling.
- Phase 8.x — navigation/panel polish, comparison, runner reliability, motion,
  in-app Settings, responsive shell, LLM Stats enrichment, docs pass.
- Phase 9.1–9.3 — data exploration, shortcuts, leaderboard.
- Phase 9.4–9.7 — Voidware provider reuse, SaaS polish, 0.9.8/0.9.10 upgrades,
  app-owned approval bridge + follow-ups.
- Milestone 10 — package-based Voidware 1.0.1 vendoring + CSS rebuild.
- E2E UI audit — nine screenshots, per-screenshot reports, M11 plan.
