# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

Nothing active. All M12/M13 follow-ups are closed. Next data refresh runs via
[`skill/SKILL.md`](skill/SKILL.md).

Standing maintenance notes (not tasks — handled as they come up during update
runs):

- New vendor without a models.dev logo → add `web/vendor/logos/<slug>.svg` +
  a `VENDOR_LOGO` entry in `web/app.js` (falls back to monogram).
- `input_capabilities` / `deprecated_on` stay honest-by-default: update runs
  only record what a primary source documents, never guesses.
- Prefer exact per-model `card_url`s as update runs read new model cards.

## Recent Completed

**Desktop scale and color polish — DONE (2026-06-09).** Enlarged the desktop
Models workbench for 1440p displays without changing the vanilla app structure:
larger sidebar/nav, bigger provider logos and labels, stronger score chips with
UI-font tabular numbers, brighter selected rows, white text on iridescent
buttons, centered single-model detail card, and centered/wider Stats and
Settings work surfaces. Bumped UI prefs to `llm-dash-ui-state-v5` so stale
zoom/column widths do not hide the new defaults. Verified with syntax/diff
checks and headed/fixed-viewport screenshots at 2560x1440, 1440x900, and
390x844.

**Install-over Voidware auth retention hardening — DONE (2026-06-09).**
Hardened LLM-Dash against old install-over verification marker artifacts:
marker-only `auth.json` files are treated as empty only for the exact old-tool
shape (`marker` + `version: 3` + empty `credentials`, no other keys), and new
secret writes move that marker aside to `.shxdowgen-install-over-marker` before
Voidware creates a real encrypted auth file. Settings shows targeted recovery
copy only when that old marker is detected; a marker-less invalid v3 file still
fails closed. Added regression coverage that generates a valid encrypted v3 file
through `@shxdowcollective/voidware/auth` and proves marker seeding does not
overwrite it. The reported install-over scripts are not present in this checkout
or tracked history, so this repo fixes the LLM-Dash auth/recovery side and
documents the missing writer scope.

**Metadata backfill follow-ups — DONE (2026-06-09).** Closed the three open
M13 follow-ups: verified logo coverage for all 10 vendors; researched
`input_capabilities` for all 34 models from cited primary sources (21 rows
upgraded; 10 stay text-only by documentation, not guesswork); upgraded 32
`card_url`s from vendor pages to exact per-model cards (MiMo x2 keep the
vendor page — their HF repos are gated). Marked GPT-5.1-Codex-Mini
(2026-04-22) and Grok Code Fast 1 (2026-05-15) deprecated per official vendor
notices. Seed (`scripts/init_db.py`) is the durable source;
`scripts/backfill_metadata_20260609.py` synced the live DB. 24 tests pass.

**Milestone 13 — Table UX, ranking, reset, and model metadata overhaul — DONE
(2026-06-08).** Schema v4 (`input_capabilities` + `deprecated_on`), Overall
25/25/25/10/15 + Value 60/25/15 ranking, header-click sort + Provider column +
resizable columns + zoom + grade collapse, capability chips + deprecation
badge + "Ignore deprecated" toggle, scoped Settings Reset tab with typed
confirm, density/copy pass. 24 tests, headed 1440+390 screenshots, nano-agent
reviews.

**Milestone 12 + follow-ups — DONE (2026-06-08).** Voidware color revival,
checkbox compare vs inspect, unified stat cards, vendored provider logos,
official `card_url` schema + migration, per-metric bar colors, fit-to-viewport
shell, and the `h()` `setProperty` root fix.

**Milestone 11 + polish — DONE.** Ground-up Voidware 1.0.4 rearchitecture
(compact zero-build controller, Models workbench, Changelog, Stats, Settings,
drawer/toast/shortcuts) plus the full A–D polish pass from the e2e audit.

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
