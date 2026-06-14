# LLM-Dash Task Board

Short, current, and actionable. Detailed handoff notes belong in `LOGBOOK.md`;
phase plans live under `docs/plans/`.

Use `[ ]` only for still-open work.

## Now

No active development task. Next data refresh runs via
[`skill/SKILL.md`](skill/SKILL.md).

Possible follow-ups (not started):
- Visual nano-agent pass on the List view + tightened Table at 2560/1440/390
  (readability/contrast/truncation) — code is in, screenshots not yet captured.

Validated 2026-06-13: a live AA-preset seed (top 8, real BYOK provider via
`.env`) ran end to end — 8 real models scored 0–10 with cited card_urls,
changelog + run_metrics written. It surfaced and fixed an out-of-root log-path
crash in `seed_catalog`. LLM Stats / OpenRouter / Exa / custom presets and the
multi-batch (>25) path are still only unit-tested, not live-exercised.

Standing maintenance notes (not tasks — handled as they come up during update
runs):

- New vendor without a models.dev logo → add `web/vendor/logos/<slug>.svg` +
  a `VENDOR_LOGO` entry in `web/app.js` (falls back to monogram).
- `input_capabilities` / `deprecated_on` stay honest-by-default: update runs
  only record what a primary source documents, never guesses.
- Prefer exact per-model `card_url`s as update runs read new model cards.

## Recent Completed

**Inline detail CSS cleanup — DONE (2026-06-14).** Removed the dead pre-rail
inline detail CSS from `web/style.css`: `.compare-area`, `.stat-model-card`,
`.stat-card-*`, `.grade-grid`/`.grade-box`, `.compare-strip`,
`.compare-remove`, adjacent orphaned compare/grade helpers, and dead chart-side
selection/sidebar rules. Kept the live rail/help rules (`.meta-item`,
`.stat-bars`, `.shortcut-note`) verified against `web/app.js`; refreshed the
shortcut tip + redesign plan note. `node --check web/app.js` is clean.

**Setup wizard seeding + reset overhaul + table redesign — DONE
(2026-06-13).** Implemented all six tracks from
[`docs/plans/2026-06-13-setup-wizard-seeding-table-redesign.md`](docs/plans/2026-06-13-setup-wizard-seeding-table-redesign.md)
via nano-agents (orchestrated + diff-reviewed). **A:** silenced the phantom
broker-unavailable grant warning (live + dry-run → stderr); `reset_models` clears
the catalog + drops `meta.last_updated` (no reseed). **B:** no default DB — empty
install returns bootstrap `needs_setup` (no auto `init_db.py`); frontend boots into
the wizard; null-DB guards; `init_db.py` kept as the offline CLI preseed.
**C:** single-nav wizard (Connection → Research → Catalog → Seed → Finish); the
two-menu bug is gone (shell subnav hidden in setup); dashboard locked during setup.
**D:** new `scripts/seed_catalog.py` (shared `ensure_schema`, candidate prefetch,
batched scoring, single `apply_update`), `POST /api/seed` + job lock on both seed
and run-update, new `aa` credential slot (AA Data API, Intelligence/Coding/Agentic
index) mirroring `llmstats`, `POST/DELETE/GET /api/aa`. **E:** Catalog preset cards
(gated by configured keys) + live seed progress + completion animation
(reduced-motion safe) + "Let's start!" + CLI escape hatch. **F:** compact **List**
view (now the default Models view, Table one click away), tighter Table density,
prefs key → `llm-dash-ui-state-v6`. Models/full reset route back into the wizard.
75 tests (5 new in `tests/test_seed_catalog.py`); needs_setup + seed dry-run smoked
in-process. A live paid seed and a List-view screenshot pass are the open
follow-ups. Docs synced (README, AGENTS, ARCHITECTURE, DEVELOPMENT, SKILL).

**Voidware 1.1.0 package-native upgrade + credential follow-ups — DONE
(2026-06-12).** Implemented
[`docs/plans/2026-06-12-voidware-1-1-0-package-native-upgrade.md`](docs/plans/2026-06-12-voidware-1-1-0-package-native-upgrade.md)
end to end. P0: bumped `@shxdowcollective/voidware` 1.0.4→1.1.0, added
`@shxdowcollective/voidware-cli@1.1.0`, env-var `.npmrc` + committed
`.env.example`, resolve the cli from `node_modules` ahead of global `which
voidware` (bridge `createRequire` + Python `resolve_cli`), token-gated `npm ci`
in `run.sh`/`run.bat`, re-vendored 1.1.0 CSS (now includes `theme-template.css`),
version stamps + smoke that asserts the cli service resolves. T1: ref-bound
`auth:ref:write`/`auth:ref:delete` broker ops so same-name multi-source
credentials can't be mutated on the wrong source, ref-scoped grant-cache
invalidation on mutation, ref-aware `_remove_secret` for provider removals.
T2: index-driven keyring-wide purge of legacy grant-cache entries via Voidware's
`userClientGrantIndexPath()` client-grant index, reaching entries written under
stale auth fingerprints. T3: provider-slot exact-source discovery now sources
from `discoverProviderCredentialsByRef` (ref-qualified, one row per source) with
the Entry 115 name-join kept as fallback. 70 tests green; `verify:voidware`
passes against 1.1.0; service resolves from `node_modules`.

**Provider slot exact-source ref candidates — DONE (2026-06-10).** Connection
candidates now join provider-discovery metadata (base URL, models URL,
endpoint mode) onto exact-source `discoverAuthRefs` rows, so same-name
provider credentials in different stores (keyring vs `auth.json`) are
individually selectable like the Exa/LLM Stats slots. Name-only fallback when
refs are unavailable. Frontend candidate keys use ref identity
(`authFilePath`/`envVar`) and dropdown labels disambiguate same-name auth-file
duplicates by basename. Plan:
[`docs/plans/2026-06-10-provider-slot-ref-candidates.md`](docs/plans/2026-06-10-provider-slot-ref-candidates.md).
57 tests. Remaining credential follow-ups (ref-bound mutations, stale cache
purge) are now scoped under the Voidware 1.1.0 upgrade track in Now.

**Reset + Voidware credential remediation — DONE (2026-06-10).** Implemented
[`docs/plans/2026-06-10-reset-voidware-credentials-nanoagent-plan.md`](docs/plans/2026-06-10-reset-voidware-credentials-nanoagent-plan.md):
typed reset confirmations actually sent, global reset busy guard + in-tab
progress/result surface, `409` reset guard during active update jobs, full
reset now revokes LLM-Dash broker grants (credentials preserved) and lands in
a guided setup mode (`?setup=1` step rail: Connection → Models → Research →
Schedule → Finish), config v2 credential slots for Connection/Exa/LLM Stats
with ref-aware discovery/selection, add/edit secret UX with server-side
external-mutation enforcement (live-metadata ownership, fail-closed), an
operation-aware approval modal (password-only for common flows, deny endpoint,
state scrubbing), and 120d grants in the official `voidware-client-grants`
namespace. 53 tests, live endpoint smoke, and headed screenshots
(`e2e/screenshots/m14-reset-credentials/`). Three follow-ups deferred (see Now).

**Desktop scale and color polish — DONE (2026-06-09).** Enlarged the desktop
Models workbench for 1440p displays without changing the vanilla app structure:
larger sidebar/nav, bigger provider logos and labels at every table zoom,
stronger score chips with UI-font tabular numbers, brighter selected rows,
white text on iridescent buttons, centered single/comparison detail titles
without helper subtitles, more readable comparison-card grade labels, and
centered/wider Stats and Settings work surfaces. Bumped UI prefs to
`llm-dash-ui-state-v5` so stale zoom/column widths do not hide the new
defaults. Verified with syntax/diff checks and headed/fixed-viewport screenshots
at 2560x1440, 1440x900, 390x844, 70% table zoom, and comparison mode.

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
