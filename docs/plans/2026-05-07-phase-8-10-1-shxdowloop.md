# Phase 8.10.1 shxdowloop

**Goal:** Execute Phase 8.10.1 from `docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md`: rebuild LLM-Dash into a Voidware 0.8.3 app shell with broker-backed auth, compact settings pages, responsive navigation, screenshot/probe verification, and minimal docs sync.

**Mode:** Normal
**Handle:** vesperline
**Agent:** gpt-5-codex
**Runtime:** codex-cli
**Started:** 2026-05-07 21:33:39 PDT (-0700)

## Preflight Results and Degraded Paths

- Workspace: `/home/phxntom/Repos/LLM-Dash`, read-write.
- Branch before approval: `main...origin/main`, clean worktree.
- Remote: `origin https://github.com/phxntomkid/LLM-Dash.git`, reachable.
- Docs paths: `docs:ok`, `docs/plans:ok`.
- Target plan: `docs/plans/M8_10_1_VOIDWARE_APP_SHELL_PLAN.md`.
- Tools available: `npm`, Node v22.14.0, Python 3.13.5, `pip`, `agent-browser`, nano-agent wrapper.
- Degraded paths: no root `package.json` scripts, no global `pytest`, no global `ruff`.
- Browser baseline: no CDP listener on `:9222`; memory had about 10 GiB available.
- `shxdowTracker`: Claude session 0%, weekly 3%; Codex session 23%, weekly 26%. Neither provider at or above 70%.
- Auth/network prompts: none encountered during preflight.
- Repo instruction note: `AGENTS.md` says not to touch `web/` for daily benchmark update runs. Phase 8.10.1 is explicitly a frontend overhaul and the user approved this phase after preflight, so this loop treats the phase-specific plan as the active scope while preserving append-only changelog/data rules.

## Branch and Remote

- Branch: `shxdowloop/2026-05-07/phase-8-10-1`
- Base: `main`
- Remote push: `origin/shxdowloop/2026-05-07/phase-8-10-1`
- PR URL hint: `https://github.com/phxntomkid/LLM-Dash/pull/new/shxdowloop/2026-05-07/phase-8-10-1`

## Runtime Budget

No explicit budget provided. Stop for hard blockers only: secret exposure risk, broker/auth commands that would require live user approval or mutate real credentials, production deploys, irreversible schedule changes, or a contradiction that cannot be resolved conservatively.

## Helper Routing

- Native-first route for exploration, stage planning, plan review, and final stage review.
- Nano-agent fallback only for small directed chores, noisy searches, or if native usage pressure rises above the 70% threshold for both Claude and Codex.
- Nano-agent wrapper: `/home/phxntom/.codex/skills/nano-agents/scripts/nano-agent.sh`.
- Nano-agent was not warmed in preflight because no nano-only override was requested and native usage pressure was low.
- Main agent owns all integrated edits, verification, commits, pushes, and final judgment.
- Implementation helpers may be used only on isolated scopes. `web/app.js` and `web/style.css` remain main-agent integrated files unless a later stage records a safer split.

## Stage/Phase Outline

## Stage 0 - Loop Setup

**Status:** Complete
**Goal:** Create the review branch, write the loop plan, sync TODO/LOGBOOK, and checkpoint the setup.
**Phases:**
- [x] 0.1 Run gated preflight and receive human proceed.
- [x] 0.2 Create and push the dedicated branch.
- [x] 0.3 Write this process plan.
- [x] 0.4 Update TODO/LOGBOOK for the loop start.
- [x] 0.5 Commit and push setup checkpoint.
- [x] 0.6 Split dashboard-update instructions from dev-agent instructions after user requested the AGENTS cleanup.
**Helpers:** Main agent only.
**Verification:** `git status --short`, `git diff --check`.
**Checkpoint:** Setup checkpoint `4aa6105` pushed; AGENTS split checkpoint pending.
**Notes:** No application code changes in this stage. `AGENTS.md` now points update-run agents to `docs/update_dashboard.md`; dev work can edit `web/` when the task calls for it.

## Stage 1 - Foundation and Auth Boundary

**Status:** Complete
**Goal:** Establish Voidware 0.8.3 assets, app-shell HTML, state routing, and broker-backed auth plumbing without completing visual polish.
**Phases:**
- [x] 1.1 Audit existing frontend/server/config contracts and Voidware source availability.
- [x] 1.2 Vendor Voidware CSS with provenance and checksum verification.
- [x] 1.3 Rewrite `web/index.html` into the Voidware app shell skeleton.
- [x] 1.4 Add area/subpage state routing and shell render hooks in `web/app.js`.
- [x] 1.5 Add server-side Voidware auth wrapper and provider/Exa status endpoints without exposing grants or secrets.
**Helpers:** Native explorer, native phase planner, native plan reviewer, native final reviewer.
**Verification:** `node --check web/app.js`; `python3 -m compileall server.py scripts`; checksum spot-checks for vendored Voidware CSS; isolated provider-state redaction check; headed `agent-browser` smoke for `#models/table`, `#models/chart`, and `#settings/provider`.
**Checkpoint:** `d81ac94` pushed.
**Notes:** Real provider, Exa, keyring, auth file, and schedule state were not mutated. User requested maximum token lifetime; all broker grant requests use `--ttl 120d`, the local Voidware maximum. The app keeps temporary legacy `#filters`, `#detail`, and `#view` slots inside the new shell to avoid a blank app before Stage 2 area migration.

## Stage 2 - Area Migrations

**Status:** Complete
**Goal:** Move Models, Changelog, Stats, and Settings into the app shell with compact sub-pages and retained behavior.
**Phases:**
- [x] 2.1 Migrate Models table/chart/detail/filter controls into the Models area.
- [x] 2.2 Migrate Changelog and Stats into area renderers with compact headers and retained SQL/data behavior.
- [x] 2.3 Split Settings into Provider, Models, Research, and Schedule sub-pages.
- [x] 2.4 Add broker auth status/migration UI for provider and Exa without leaking sensitive values.
- [x] 2.5 Remove old global chrome render paths after replacement behavior is covered.
**Helpers:** Native explorer, native phase planner, native plan reviewer, native final reviewer. Execution remains main-agent integrated unless a phase can be safely isolated.
**Verification:** `node --check web/app.js`; `python3 -m compileall server.py scripts`; `git diff --check`; isolated `/api/provider` redaction check; headed browser smoke for Models table/chart, Changelog, Stats, Settings Provider, and Settings Research.
**Checkpoint:** `b1f80ac` pushed.
**Notes:** Preserved SQL queries and data shapes. Removed legacy `#view`, `#filters`, `#detail`, `#view-actions`, and `.controls-bar` DOM slots. User reiterated max token lifetime for Voidware auth, so broker UI now calls out the max grant TTL and the wrapper continues to request `--ttl 120d`.

## Stage 3 - Visual Polish, Responsive Contracts, and Docs Sync

**Status:** Complete
**Goal:** Reduce duplicate CSS, tighten copy/typography, complete mobile/tablet navigation, and update docs that would be actively wrong.
**Phases:**
- [x] 3.1 Replace duplicated tokens/components in `web/style.css` with app-specific Voidware overrides.
- [x] 3.2 Add responsive sidebar/drawer, mobile CTA, subnav, and focus/reduced-motion behavior.
- [x] 3.3 Polish copy and visual hierarchy across table, chart, changelog, stats, settings, update, and setup surfaces.
- [x] 3.4 Minimal docs sync for Voidware 0.8.3, app-shell IA, and broker-backed auth.
- [x] 3.5 Update TODO/LOGBOOK and process plan with remaining verification findings.
**Helpers:** Native explorer, native phase planner, native plan reviewer, native final reviewer; optional nano-agent for CSS dead-selector searches.
**Verification:** `node --check web/app.js`; `python3 -m compileall server.py scripts`; `git diff --check`; stale docs/CSS searches; headed responsive smoke at 1366x768, 820x1180, and 390x844 plus mobile drawer Escape behavior.
**Checkpoint:** `78806dd` pushed.
**Notes:** Full desktop/tablet/mobile evidence matrix remains in Stage 4. Stage 3 focused on stale docs/CSS cleanup and responsive smoke rather than final visual sign-off.

## Stage 4 - Verification and Evidence

**Status:** Complete
**Goal:** Prove the phase with syntax checks, browser screenshots, overflow/accessibility probes, auth redaction checks, docs/TODO/LOGBOOK sync, and final review.
**Phases:**
- [x] 4.1 Run syntax and Python compile verification.
- [x] 4.2 Start the local server safely and run headed `agent-browser` screenshots for desktop, laptop, tablet, and mobile.
- [x] 4.3 Save screenshots and probe artifacts under `artifacts/phase-8-10-1-app-shell/`.
- [x] 4.4 Run overflow, clipped text, console error, focus, reduced-motion, and secret-redaction probes.
- [x] 4.5 Final diff review, TODO/LOGBOOK/process-plan sync, checkpoint commit, and push.
**Helpers:** Native final reviewer; optional nano-agent for artifact inventory or probe log summaries.
**Verification:** Full matrix below passed with headed `agent-browser` evidence at 1920x1080, 1366x768, 820x1180, and 390x844.
**Checkpoint:** Pending commit.
**Notes:** Broker status remained `broker_unavailable` in isolated test roots, so verification covered non-mutating status/redaction behavior. Secret writes were not attempted.

## Helper Roles and Iteration Stop Conditions

- Explorer stops when relevant files, contracts, risks, and test hooks are identified.
- Phase planner stops when each stage has ordered file-level edits and verification commands.
- Plan reviewer stops after returning actionable issues only, or no findings.
- Final reviewer stops after checking request alignment, regressions, tests, security, docs/TODO/LOGBOOK/process-plan sync, and checkpoint readiness.
- Execution iteration stops after two failed verification attempts for the same stage; the stage is then marked Blocked with evidence unless a small obvious fix remains.

## Checkpoint Log

| Stage | Commit | Push | Verification | Notes |
|---|---|---|---|---|
| 0 | `4aa6105`, `00e9b1c` | Pushed | `git diff --check` passed for setup and AGENTS split | Branch/process setup, then AGENTS/update-dashboard split. |
| 1 | `d81ac94` | Pushed | `node --check`; `python3 -m compileall`; CSS checksum spot-check; isolated auth redaction; headed browser smoke | Foundation and auth boundary. |
| 2 | `b1f80ac` | Pushed | `node --check`; `python3 -m compileall`; `git diff --check`; isolated `/api/provider` redaction; headed browser smoke | Area migrations. |
| 3 | `78806dd` | Pushed | `node --check`; `python3 -m compileall`; `git diff --check`; stale-reference search; responsive browser smoke | Polish/responsive/docs. |
| 4 | Pending | Pending | `node --check`; `python3 -m compileall`; `git diff --check`; final browser screenshot matrix; overflow/clipped/console/focus/reduced-motion/auth probes | Evidence and final readiness. |

## Verification Matrix

| Area | Command or Check | Expected Signal |
|---|---|---|
| JS syntax | `node --check web/app.js` | Exit 0 |
| Python syntax | `python3 -m compileall server.py scripts` | Exit 0 |
| CSS provenance | Compare vendored Voidware files against `~/Repos/voidware/src/css/` when available | Matching checksum for copied files |
| Server smoke | Start local server with isolated config/auth roots where supported | App loads and API routes respond |
| Browser screenshots | Headed `agent-browser` captures at 1920x1080, 1366x768, 820x1180, 390x844 | Saved artifacts, no blank or clipped primary surfaces |
| UI probes | Overflow, clipped text, console errors, focus order, reduced motion | No blocking findings |
| Auth safety | Search API/log/screenshot artifacts for grants/secrets patterns such as `vwgr_` | No leaks |
| Git hygiene | `git diff --check`; final diff review | No whitespace errors or unrelated edits |

## Open Risks

- The app is a monolithic vanilla JS/CSS frontend, so large edits can regress unrelated behavior.
- `AGENTS.md` frontend boundary is written for daily benchmark update runs; this phase intentionally edits frontend files.
- Voidware source may be absent or newer than the pinned 0.8.3 expectation; Stage 1 currently resolves the local 0.8.3 source at commit `84ab12b`.
- `voidware` may be absent from PATH; Stage 1 resolves `VOIDWARE_CLI`, PATH, then local `node ~/Repos/voidware/packages/cli/dist/bin.js`.
- Broker grant approval may need an external approval surface and should not be forced unattended. Broker requests use max TTL `120d`.
- Existing pytest/ruff commands are not globally available; verification should use available repo-local or compile/smoke checks unless dependencies are installed safely.
- Browser verification must remain headed and sequential to avoid WSL/CDP resource issues.

## Merge Readiness Checklist

- [x] Dedicated branch pushed.
- [x] Stage checkpoints committed and pushed.
- [x] No old changelog files modified or deleted.
- [x] No `data/dash.sqlite` or append-only score history modified.
- [x] Voidware vendor provenance recorded.
- [x] Broker grants/secrets never exposed in browser responses, logs, changelogs, screenshots, or artifacts.
- [x] Desktop, laptop, tablet, and mobile screenshots captured.
- [x] Overflow, clipped text, console, focus, reduced-motion, and auth redaction probes passed or have documented blockers.
- [x] `TODO.md`, `LOGBOOK.md`, and relevant docs are synced.
- [x] Final self-review has no blocking findings.
