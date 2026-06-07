# 2026-06-06 — Milestone 11 Redesign Nanoagent Plan

## Goal

Complete Milestone 11 as a ground-up frontend rearchitecture: upgrade LLM-Dash
to the latest Voidware package, replace the large legacy vanilla surface with a
calmer, more modular, friendly Voidware workbench, verify the app with code
checks and headed screenshots, route screenshots through a visual nano-agent
against the Voidware checklist, iterate until the UI is polished, route the
final diff through a pro nano-agent review, update TODO/LOGBOOK, then commit and
push `main`.

## Version Baseline

- Starting repo pin: `@shxdowcollective/voidware@1.0.1`.
- Latest npm version checked on 2026-06-06: `1.0.4`.
- Completed action: updated `package.json`, `package-lock.json`, vendored
  `web/vendor/voidware/`, version mentions in docs, and smoke expectations.

## Implementation Scope

- `web/index.html`: recompose shell landmarks, overlay roots, and script loading
  around the new architecture.
- `web/app.js`: replace the legacy monolith with a smaller app controller,
  durable state, data loaders, route renderers, settings/update workflows, and
  reusable DOM helpers. Keep the SQLite/API contracts, not the old component
  structure.
- `web/style.css`: replace the legacy app layer with a fresh Voidware 1.0.4
  skin: compact shell, calm panels, readable tables/cards, responsive mobile
  drawer, modern chart surface, helpful empty states, score-tier encoding,
  scroll cues, focus states, and reduced-motion rules.
- `scripts/voidware_package_smoke.mjs`: expected Voidware version.
- Docs/task files: `TODO.md`, `LOGBOOK.md`, README/development/architecture
  version references as needed.

## Preservation Contract

The UI may be rebuilt from the ground up, but these behavior/data contracts must
survive:

- Score math: overall = 30% intelligence + 30% coding + 30% agent + 10% speed;
  value = 80% overall + 20% cost; tier thresholds S/A/B/C/D/F unchanged.
- Data reads: `v_models_latest`, `model_scores`, `changelogs`, `run_metrics`,
  and `meta.last_updated` stay the browser data sources.
- API reads/writes: `/api/bootstrap-status`, `/api/provider`,
  `/api/provider/*`, `/api/exa`, `/api/llmstats`, `/api/schedule`,
  `/api/prompt`, `/api/open-terminal`, `/api/meta`, `/api/run-update`, and
  Voidware broker approval endpoints remain wired.
- Settings/update behavior: saved provider credentials, test connection, model
  test, Exa/LLM Stats save/remove, schedule save/remove, manual prompt copy,
  background refresh polling, and broker approval/recovery flows keep working.
- Routes: modern hash routes (`#models/table`, `#models/chart`,
  `#settings/provider`) and legacy links (`#table`, `#chart`, `#data`) remain
  valid.
- Keyboard behavior: `/` search focus, `j/k` model movement, `e` export, `r`
  refresh, `?` shortcuts, and Escape overlay/drawer dismissal remain useful.
- Drawer behavior: mobile sidebar uses `.open` / `data-vw-open="true"` and
  keeps main content out of the tab order while open.
- Changelog Compare stays removed; docs should no longer advertise it.

## Nano-Agent Roles

1. Pro plan review: read this plan and the existing May 31 M11 plan. Return
   actionable risks only. Read-only.
2. Visual review: inspect final headed screenshots at `1280x800`, `768x600`,
   `1280x640`, `390x844`, plus drawer evidence against the Voidware checklist.
   Read-only, image route.
3. Pro final diff review: inspect the working tree for request alignment,
   regressions, tests, docs/TODO/LOGBOOK sync, and commit-readiness. Read-only.

## Screenshot Matrix

- Models table desktop: `1280x800`.
- Models table tablet: `768x600`.
- Models chart short desktop: `1280x640`.
- Models mobile: `390x844`.
- Mobile drawer: `390x844`.
- Changelog desktop: `1280x800`.
- Stats low-data / normal desktop: `1280x800`.
- Settings provider and models/research/schedule subpages: `1280x800`.
- Short-height check for any below-fold controls: `1280x640`.

## Verification

- `npm ci`
- `npm run verify:voidware`
- `node --check web/app.js`
- `python3 -m py_compile server.py scripts/*.py tests/*.py`
- `python3 -m unittest discover -v`
- `git diff --check`
- Headed browser screenshot/probe run with `agent-browser`, including route
  navigation, CSV export toast, chart mode/selection, Settings test/save
  controls where safe, refresh/manual prompt overlay, and mobile drawer.

## Risks

- This is intentionally broad frontend work. Preserve behavior through data/API
  contracts, not through legacy layout or helper names.
- Voidware package changes may alter vendor CSS imports; smoke test must catch
  missing CSS/runtime exports.
- Responsive controls must keep first model card visible at mobile/tablet sizes.
- Broker/runtime approval behavior needs an isolated regression check after the
  package bump; no real secrets may be logged or screenshotted.
- Visual helper output is advisory, but if it flags real polish issues, iterate
  until screenshots read as friendly, helpful, calm, sleek, minimalist, modern
  Voidware UI.
