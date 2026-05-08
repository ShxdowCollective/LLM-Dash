# LLM-Dash Logbook

Casual handoff notes. Newest first.

---

## Entry 056 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, shxdowloop)
**Cycle:** Phase 8.10.1 Stage 3
**Task:** Sync Voidware 0.8.3 docs and responsive shell polish

---

Completed the Stage 3 docs/responsive pass.

**Changed:**
- Updated README, Architecture, and Development docs from Voidware 0.7.1/keyring-first language to Voidware 0.8.3 with broker-backed credential writes and legacy read fallback.
- Documented that Voidware broker grant requests use the max supported `120d` TTL and that reset leaves broker grants/secrets alone.
- Trimmed stale CSS references left behind by the removed global app slots.

**Verification:**
- `node --check web/app.js`
- `python3 -m compileall server.py scripts`
- `git diff --check`
- Static stale-reference search for old chrome slots, Voidware 0.7.1 references, and old Data-page docs returned no matches.
- Headed `agent-browser` responsive smoke: 1366x768 Models, 820x1180 Stats, and 390x844 Settings Research had no horizontal page overflow; mobile sidebar opened and closed with Escape.

**Helper route:** main-agent implementation and verification.
**Degraded paths:** none new.
**?** None.

---

## Entry 055 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, shxdowloop)
**Cycle:** Phase 8.10.1 Stage 2
**Task:** Migrate dashboard areas into the Voidware app shell

---

Completed Stage 2 area migration on `shxdowloop/2026-05-07/phase-8-10-1`.

**Changed:**
- Moved Models filters, sort controls, Table/Chart segmented toggle, CSV export, comparison cards, and tier legend into a self-contained Models area renderer.
- Moved Stats filters and metrics CSV download into the Stats area, kept uPlot chart scheduling, and switched metric cards toward Voidware metric classes.
- Moved changelog markdown onto the `.vw-markdown` surface and compacted changelog list entries with Voidware card styling.
- Split Settings into Provider, Models, Research, and Schedule sub-pages with `.vw-settings-group` sections. Manual Update remains collapsible on the Provider page.
- Added safe broker auth status on Provider and Research pages. Browser-visible auth status now shows the max grant TTL (`120d`) without returning CLI paths, secret target names, grants, or plaintext secrets.
- Removed the legacy global DOM slots (`#view`, `#filters`, `#detail`, `#view-actions`, `.controls-bar`) and fixed `switchView()` so route state carries the target view.

**Verification:**
- `node --check web/app.js`
- `python3 -m compileall server.py scripts`
- `git diff --check`
- Isolated `/api/provider` redaction check with fake Provider/Exa env secrets: no fake secrets, `vwgr_`, broker secret targets, or Voidware CLI paths in JSON.
- Headed `agent-browser` smoke with isolated auth root: Models table/chart, Stats, Changelog, Settings Provider, and Settings Research rendered with no page errors and no legacy global slots in the DOM.

**Helper route:** native explorer and native phase planner returned Stage 2 guidance; main-agent implementation and verification.
**Degraded paths:** Chart smoke initially exposed a real `switchView()` route-state bug; fixed before checkpoint.
**?** None.

---

## Entry 054 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, shxdowloop)
**Cycle:** Phase 8.10.1 Stage 1
**Task:** Build the Voidware app-shell and auth-boundary foundation

---

Completed Stage 1 of the shxdowloop plan on `shxdowloop/2026-05-07/phase-8-10-1`.

**Changed:**
- Vendored Voidware 0.8.3 CSS from `/home/phxntom/Repos/voidware/src/css` at commit `84ab12b`, with provenance in `web/vendor/voidware/VERSION.md`.
- Reworked `web/index.html` into a Voidware page shell with sidebar navigation, mobile header/drawer hooks, page header, subpage nav, and retained legacy content slots so the app does not blank before the full Stage 2 migration.
- Added `state.area`/`state.subview`, new `#models/table`-style hash routing, legacy hash compatibility, sidebar sync, and mobile drawer Escape/backdrop behavior in `web/app.js`.
- Added `scripts/voidware_auth.py` with CLI resolution via `VOIDWARE_CLI`, PATH `voidware`, or local `node ~/Repos/voidware/packages/cli/dist/bin.js`.
- Added Voidware broker auth precedence after env keys and before legacy keyring/auth-file reads. Secret writes/deletes now use the broker with `--ttl 120d`; legacy stores remain migration fallback for reads.
- Added `LLM_DASH_SHXDOW_ROOT` isolation support for config/auth and schedule state, plus schedule job-name env overrides.
- Redacted `vwgr_...` grant tokens from server log tails.

**Verification:**
- `node --check web/app.js`
- `python3 -m compileall server.py scripts`
- Voidware CSS checksum spot-checks for `index.css`, `layout.css`, and `responsive.css`
- Isolated `public_provider_state()` check: no `vwgr_` or `api_key` strings in JSON
- Headed `agent-browser` smoke with isolated root and env-only fake provider: no page errors, `#models/table` rendered, `#models/chart` and `#settings/provider` routed correctly

**Helper route:** native explorer, native phase planner, native plan reviewer; main-agent implementation.
**Degraded paths:** `voidware` is not on PATH, but the local CLI fallback works for broker status calls. Broker itself was unavailable, returning deterministic `broker_unavailable`.
**?** None.

---

## Entry 053 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, docs cleanup)
**Cycle:** Agent instruction split
**Task:** Move dashboard update instructions out of AGENTS.md

---

Split the mixed agent instructions so update-only rules no longer block normal development work.

**Changed:**
- Rewrote `AGENTS.md` as a work-type router: dashboard update runs point to `docs/update_dashboard.md`, while development work keeps repo conventions, verification expectations, and editable `web/` scope.
- Added `docs/update_dashboard.md` with the daily benchmark update triggers, non-negotiables, metrics, identity, and update-only boundaries.
- Preserved the daily-update frontend read-only rule only for update runs.

**Verification:** pending checkpoint `git diff --check`.
**Helper route:** main agent only.
**Degraded paths:** none new.
**?** None.

---

## Entry 052 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, shxdowloop)
**Cycle:** Phase 8.10.1 shxdowloop setup
**Task:** Start branch-backed execution for the Voidware app shell overhaul

---

Created and pushed `shxdowloop/2026-05-07/phase-8-10-1` after the gated preflight and user approval.

**Changed:**
- Added the live shxdowloop process plan at `docs/plans/2026-05-07-phase-8-10-1-shxdowloop.md`.
- Recorded the Phase 8.10.1 execution checkpoint in `TODO.md`.
- Noted the `AGENTS.md` frontend boundary conflict in the loop plan: the daily-update "do not touch web/" rule is scoped as superseded for this explicitly approved frontend phase.

**Verification:** pending setup checkpoint `git diff --check`.
**Helper route:** native-first; nano-agent fallback only. Nano wrapper available but not warmed.
**Degraded paths:** no root package scripts, no global pytest, no global ruff.
**?** None.

---

## Entry 051 — 2026-05-07

**Agent:** GPT-5 Codex (silverline, docs cleanup)
**Cycle:** TODO/logbook maintenance
**Task:** Condense the active task board and rotate logbook history

---

Reformatted `TODO.md` into a shorter active roadmap focused on open work. The detailed completed Phase 8.6 through 8.10 checklists were collapsed into Completed History, while Phase 8.10.1 keeps the done planning checkpoints and the remaining implementation/verification tasks.

Also rotated the root logbook because it had passed the local ~1000-line split convention: root now keeps the newest five entries, and older entries were archived under `docs/logbooks/`.

## Entry 050 — 2026-05-07

**Agent:** GPT-5 Codex (emberline, plan update)
**Cycle:** Phase 8.10.1 auth scope correction
**Task:** Add Voidware 0.8.3 broker-backed auth to the app shell plan

---

Updated the ignored Phase 8.10.1 plan and tracked TODO checkpoint after the user clarified that the app-shell phase must include full Voidware auth.

**Changed:**
- Bumped the plan/TODO target from Voidware 0.8.2 to 0.8.3 after confirming local `~/Repos/voidware` and the installed `voidware-spec` skill both report 0.8.3.
- Added a dedicated Voidware auth direction: LLM-Dash should obtain an opaque broker permission grant (`vwgr_...`) from the local auth grant broker, using durable broker persistence when keyring-backed and surfacing session-only state when memory-backed.
- Added implementation requirements for `scripts/voidware_auth.py`, server endpoint updates, provider/Exa secret names, grant scopes, broker JSON errors, legacy keyring/auth-file migration, and redaction rules.
- Added broker auth to implementation order, file scope, risks, verification commands, programmatic probes, and the functional/regression checklists.

No app code was implemented in this pass; this keeps 8.10.1's execution plan honest before coding starts.

---

## Entry 049 — 2026-05-07

**Agent:** GPT-5 Codex (emberline, plan review)
**Cycle:** Phase 8.10.1 plan hardening
**Task:** Review the Voidware app shell plan with native subagents and pro nanoagent

---

Reviewed and revised `docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md` before implementation.

**Review route:**
- Native explorer subagent mapped the current `web/` shell, `app.js` render/routing hotspots, docs constraints, and Voidware 0.8.2 source.
- Native reviewer found real plan gaps: Settings destructive-test safety, hash/back-forward routing, unsafe parallel implementation, Update/Run IA, accessibility criteria, concrete verification, docs sync, uPlot CSS preservation, and vendored CSS provenance.
- Pro nanoagent review found follow-up gaps around render dispatch shape, `renderModelsSegmented()`, `MODEL_VIEWS`, local Voidware spec preflight, Settings isolation support, CSS integrity checks, localStorage migration probing, skip-link keyboard testing, and reduced-motion checks.

**Plan changes made:**
- Made implementation sequential under the main agent; helpers are read-only review/verification only.
- Added concrete routing semantics (`pushState` vs `replaceState`, `hashchange`/`popstate`, canonical hashes, legacy hash normalization).
- Switched filter collapsibles to native `<details class="vw-collapsible">` and added drawer/skip-link/focus acceptance criteria.
- Added Settings dirty-state/revert requirements and destructive verification isolation rules.
- Added local Voidware 0.8.2 preflight, vendored CSS `VERSION.md`, copied-file list, uPlot CSS preservation, and SHA verification.
- Added render-dispatch pseudocode, `renderModelsSegmented()` responsibility, `MODEL_VIEWS` migration note, and deleted-slot grep checklist.
- Added minimal docs sync to 8.10.1 and exact verification commands/artifact names/probes.

**Updated:** ignored plan file, `TODO.md` review checkbox. No app implementation started.

---

## Entry 048 — 2026-05-07

**Agent:** Claude Opus 4.6 (nullpath, planning)
**Cycle:** Phase 8.10.1 plan
**Task:** Write detailed implementation plan for Voidware app shell overhaul

---

Wrote the full execution plan for Phase 8.10.1 at `docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md`. This replaces the top-nav single-page layout with a voidware v0.8.2 sidebar-based app shell.

**Key design decisions:**
- Stay vanilla HTML/CSS/JS (no build step). Vendor voidware CSS as static files in `web/vendor/voidware/`.
- 4 sidebar areas: Models (Table/Chart as segmented toggle), Changelog, Stats, Settings (4 sub-pages via `.vw-subpage-nav`).
- Settings replaces 6 stacked collapsible panels with 4 compact sub-pages: Provider, Models, Research (Exa + LLM Stats), Schedule.
- Mobile: sidebar becomes overlay drawer with hamburger toggle. Tablet: sidebar collapses to 52px icon rail.
- State model adds `state.area` + `state.subview{}` with computed `state.view` getter/setter for backward compat.

**Review passes:**
1. Nano-agent exploration (2 agents parallel): voidware spec audit + current web app audit. Found dual button system, background layers, spacing token gaps.
2. Nano-agent plan review: found 6 gaps (page-shell-offset, boot screen, markdown h1/h2, tablet sidebar toggle, collapsible pattern, manual update placement) and 5 human-decision flags. All addressed.
3. Codex final review: found `#view` → `#content` regression in `render()`, `state.view` setter omission, localStorage migration mismatch, hash validation gap, and wizard/overlay dependency. All addressed.

**Updated:** TODO.md (plan reference, first two checkboxes marked done).

---

## Entry 047 — 2026-04-29

**Agent:** GPT-5.5 (cinderwire, planning)
**Cycle:** Phase 8.10.1 kickoff
**Task:** Update TODO for full UI/UX overhaul

---

Updated `TODO.md` to stop treating the current 8.10 Settings UI as shippable. The functionality can stay as substrate, but the product shell needs a real redesign.

Added Phase 8.10.1 as a blocker before LLM Stats/docs follow-up work. The new direction is side nav for primary areas, top sub-pages within each area, compact workflow-first surfaces, no long-scroll Settings, less card soup, better typography/copy, and hard screenshot/probe gates across desktop, laptop, tablet, and mobile.

Also added the expectation that we write a fresh implementation plan before coding. This one needs architecture taste, not more duct tape.
