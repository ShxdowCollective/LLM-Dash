# LLM-Dash Logbook

Casual handoff notes. Newest first.

---

## Entry 092 — 2026-05-29

**Agent:** GPT-5 Codex (nightbloom, planning)
**Cycle:** Milestone 10
**Task:** Import Voidware 1.0.1 and plan full CSS rebuild

---

Started Milestone 10 as the new top-level work queue, replacing the Phase 9.7
approval follow-up and paused wizard CSS polish queue.

- Added `@shxdowcollective/voidware@1.0.1` as a pinned npm dependency with a
  committed package lock.
- Added `node_modules/` to `.gitignore`.
- Verified the installed package exports CSS plus `auth`, `auth-templates`,
  `config`, `paths`, `logging`, `themes`, `types`, `mui`, and `tailwind`.
- Confirmed package CSS currently matches the vendored CSS files, aside from
  `VERSION.md` and the package-only `theme-template.css`; the milestone still
  needs a package-based vendor refresh and 1.0.1 provenance update.
- Wrote the detailed Milestone 10 implementation plan covering package source
  of truth, runtime API audit, full `web/style.css` rebuild, settings/wizard
  recomposition, approval modal QA, screenshot matrix, and verification gates.
- Updated `TODO.md` so Milestone 10 is the sole active queue and old follow-up
  items are no longer pending.
- Updated README/development/architecture docs to reference Voidware 1.0.1 and
  the new npm package dependency.

Verification:

- `npm ci`
- `node --check web/app.js`
- `node --check scripts/voidware_app_broker.mjs`
- `python3 -m py_compile server.py scripts/*.py tests/*.py`
- `python3 -m unittest discover -v`
- `git diff --check`
- `npm install`
- `npm view @shxdowcollective/voidware@1.0.1 version dist.tarball exports --json`
- `python3 ~/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/LLM-Dash`

---

## Entry 091 — 2026-05-27

**Agent:** Composer (Cursor)
**Cycle:** Phase 9.7 follow-up
**Task:** OpenTabs wizard new-key advance check (paused on user request)

---

Resumed the remaining TODO item: final wizard-owned new-key advance via OpenTabs
after the input/click path stabilizes. User asked to pause before completing
live Voidware password approval.

Work done before pause:

- Started OpenTabs MCP (`opentabs start --background`); extension connected.
- Confirmed LLM-Dash was on `http://127.0.0.1:8787` (prior process used
  `LLM_DASH_SHXDOW_ROOT=/tmp/llm-dash-test-HCLnY3`).
- Ran headed wizard step 0 with OpenTabs `browser_type_text` on `#wizard-api-key`,
  connection test (expected HTTP 401 on disposable key), and Skip. API key text
  stayed populated through test failure (screenshot evidence).
- Observed approval modal showing **Read saved key** (`auth:secret:read`) in
  several runs instead of **Save new key** (`auth:secret:write`), likely because
  an existing Voidware secret or connection-test grant path surfaced read
  approval while step 0 save had not yet completed (`has_provider` still false).
- Direct `POST /api/provider` with a fresh disposable key returned expected
  `403` / `approval_pending` with `auth:secret:write`.
- Restarted uvicorn with a fresh isolated root
  (`LLM_DASH_SHXDOW_ROOT=/tmp/llm-dash-opentabs-1779931606`) and
  `scripts/reset_local_state.py`; browser rerun still showed read approval on
  Skip — follow-up should reconcile wizard save payload vs. connection-test
  pending grants before password entry.
- `browser_execute_script` calls failed locally with OpenTabs adapter load errors;
  used `browser_select_option`, `browser_type_text`, and `browser_click_element`
  instead.

Evidence:

- `artifacts/browser-sessions/2026-05-27-opentabs-new-key-advance/`
  (`01`–`07` screenshots).

Stopped on request:

- `opentabs stop`
- Killed `uvicorn server:app` on `127.0.0.1:8787` (no dashboard server left
  running after this entry).

Remaining:

- `TODO.md` — Phase 9.7 final wizard new-key advance check still `[ ]`.
- Resume with OpenTabs + restarted `./run.sh` (or uvicorn with chosen
  `LLM_DASH_SHXDOW_ROOT`), fresh wizard, write approval modal, then user
  Voidware password when the modal shows **Save new key** / write operation.

---

## Entry 090 — 2026-05-27

**Agent:** Kilo (auth workflow review and optimization)
**Cycle:** Phase 9.7 follow-up
**Task:** Validate last commit, optimize and enhance the entire auth workflow

---

Reviewed Entry 089 and commit `b121bd2` (chained approval handling, 5-minute
timeout, chained-pending response passthrough). Validated all 13 existing
tests pass and the backend/frontend syntax checks are clean.

Identified and fixed three broker correctness issues:

- Chained approval auto-resolve now checks credential compatibility before
  reusing the original password/secret. If the chained approval requires a
  different credential type (e.g., `secretRequired` when only a password was
  provided), the broker surfaces it to the frontend instead of silently
  failing.
- `responseFromBrokerGrant` now accepts an explicit `target` parameter
  instead of reading `activeGrant.target` after the caller may have set
  `activeGrant = null`.
- Extracted a shared `raceForPending` helper from the duplicated
  `Promise.race` patterns in `startGrant` and `startBrokerRequest`.

Enhanced the approval modal UX:

- Added a live countdown timer that ticks from the approval timeout (default
  5 minutes), turns amber under 60 seconds, and shows "Expired" at zero.
- Password/secret input auto-focuses when the modal opens.
- Enter key submits the approval form.
- `is-submitting` state dims the modal and adds a spinner to the approve
  button.
- Failed approvals now show a "Try Again" button instead of only a dead-end
  error message.
- Error messages use `role="alert"` and `aria-live="assertive"` for
  immediate screen-reader announcement.
- Countdown timer is cleaned up on deny, expiry, and success paths.

Verification:

- `node --check scripts/voidware_app_broker.mjs && node --check web/app.js`
- `python3 -m py_compile scripts/voidware_auth.py scripts/config.py server.py tests/test_voidware_auth.py`
- `python3 -m unittest discover -v` — 13/13 pass
- `git diff --check` — clean

---

## Entry 089 — 2026-05-27

**Agent:** GPT-5 Codex (velvetcircuit, follow-up)
**Cycle:** Phase 9.7 follow-up
**Task:** Finish OpenTabs approval follow-ups

---

Closed the remaining Settings/fallback follow-ups and pushed the final wizard
check as far as possible before hitting a live Voidware approval lifecycle
blocker.

- Verified the wizard-owned new-key flow with OpenTabs on an isolated
  `LLM_DASH_SHXDOW_ROOT`: real input/click reached the in-app Voidware approval
  modal for `llmdash.provider.api_key`.
- Captured the wizard approval prompt and Settings broker-conflict evidence
  under `artifacts/browser-sessions/2026-05-27-opentabs-followups/`.
- Verified Settings renewal copy with a reproducible grant fixture:
  `Renew access`, `Renew after May 20, 2026`, `Expires Jun 5, 2026`.
- Fixed access-conflict recovery copy so Settings avoids internal broker
  jargon and tells the user to stop background access or reopen Voidware
  Manager.
- Added confirmed Settings recovery for access conflicts: the user clicks
  `Stop Background Access`, confirms with `Confirm Stop Access`, and the app
  calls `POST /api/voidware/broker/stop` before refreshing provider state.
- Revisited the fallback policy: env stays first, legacy keyring reads remain
  migration-only, and new secret writes no longer silently fall back to keyring
  when Voidware approval/broker access is unavailable.
- Extended the app-owned approval timeout to 5 minutes and surfaced that window
  in the modal.
- Added stale-pending recovery, chained-pending response handling, and
  single-submit guards for the wizard approval modal.
- Removed the modal's real form-submit path so approval is button-only.
- Repeated live OpenTabs retries reached the password modal, but submitting the
  Voidware password still returned `Finish the open approval first.` and then
  collapsed to wizard expiry.

Verification:

- `node --check scripts/voidware_app_broker.mjs && node --check web/app.js`
- `python3 -m py_compile scripts/voidware_auth.py scripts/config.py server.py tests/test_voidware_auth.py`
- `python3 -m unittest tests.test_voidware_auth -v`
- OpenTabs fixture confirmed `Stop Background Access` -> `Confirm Stop Access`
  -> `Background access stopped`.

Remaining blocker:

- Final wizard advance remains blocked in the live password-backed approval
  path. Evidence points to the Voidware app-owned broker issuing or retaining a
  second pending approval inside the same operation; LLM-Dash now handles the
  obvious stale/double-submit/chained-pending cases, but the live bridge still
  returns `Finish the open approval first.`. Next pass should instrument
  `scripts/voidware_app_broker.mjs` around `requestApproval()`, `approve()`,
  `activeGrant`, and `cancelPending()` with request IDs and operation targets,
  or reproduce directly against the Voidware service API outside the browser.

---

## Entry 088 — 2026-05-27

**Agent:** GPT-5 Codex (emberline, wrap-up)
**Cycle:** Phase 9.7 follow-up
**Task:** Finalize Voidware approval polish and handoff

---

Wrapped the OpenTabs/password-backed approval pass and cleaned up the final UX
findings before handoff.

- Changed the saved-key granted action to `Refresh access`.
- Added the larger Connection-step Voidware-spec restructure to the wizard CSS
  polish backlog.
- Added post-save confirmation for new keys: `Saved in Voidware`, with copy
  clarifying that LLM-Dash only stored connection settings.
- Verified stale/expired approval recovery closes the modal and shows wizard
  recovery copy.
- Confirmed saved-key approval reaches the provider and new-key write approval
  leaves config secret-free.

Verification:

- `node --check scripts/voidware_app_broker.mjs && node --check web/app.js`
- `python3 -m py_compile scripts/voidware_auth.py scripts/config.py server.py tests/test_voidware_auth.py`
- `python3 -m unittest tests.test_voidware_auth -v`
- `git diff --check`

---

## Entry 087 — 2026-05-27

**Agent:** GPT-5 Codex (emberline, verification)
**Cycle:** Phase 9.7 follow-up
**Task:** Implement new-key Voidware approval recovery

---

Started the OpenTabs wizard verification pass and tested the “Use a new key”
storage assumption with disposable fake keys.

- Confirmed OpenTabs and the LLM-Dash dev server are running and opened the
  setup wizard at `127.0.0.1:8787`.
- Proved the app config does not persist entered API key material.
- Found a real bridge bug: denied/failed Voidware bridge write/delete responses
  could be treated as successful by `scripts/voidware_auth.py`.
- Fixed the false-success path so `approval_denied` now raises instead of
  letting `/api/provider` report a saved provider.
- Added regression coverage in `tests/test_voidware_auth.py`.
- Added pending write/delete handling in `scripts/voidware_app_broker.mjs`.
- Added wizard recovery for new-key saves: when `/api/provider` returns
  Voidware `approval_pending`, the existing approval modal opens; after approval,
  the wizard saves the non-secret provider config without resubmitting the key
  and continues to the next step.
- Re-ran the live API path after restart; encrypted Voidware auth now returns a
  structured `approval_pending` payload instead of silent success.
- Fixed fullscreen wizard approval rendering: the wizard hides `#overlay-root`,
  so the approval modal now renders inside `#wizard-page` while setup is open.
- Replaced raw credential chips (`keyring`, `responses`, `reusable`,
  `user-file`) with user-facing labels in the wizard and Settings provider card.
- Captured OpenTabs evidence for saved OpenAI/Kilo key approval, new-key
  approval, Settings chip copy, and narrow wizard/modal layout.
- Completed the saved-key approval path with the Voidware password: the wizard
  reached the provider, got the expected sandbox-key HTTP 401, and persisted
  only `provider_credential_name`/grant metadata.
- Completed the new-key write path through the app-owned approval modal with a
  disposable fake key. The fake key was saved through Voidware but never written
  to `~/.shxdow/config/shxdow.llmdash.json`.
- Fixed approval lifecycle rough edges found during the live pass:
  - approval modal copy now uses human labels instead of `Operation`, `TTL`,
    raw scopes, and internal target strings;
  - the modal submits on Enter without rebuilding/flashing the whole wizard;
  - stale/expired approvals auto-close and show recovery copy in the wizard;
  - unrelated pending approvals no longer hijack saved-key/new-key flows;
  - server error redaction no longer reads Voidware secrets just to sanitize
    an error;
  - new-key saves no longer reread the freshly written provider secret before
    returning.
- Added a `Saved in Voidware` confirmation card for successful new-key saves.
- Changed the saved-key granted-state action from `Approve Access` to
  `Refresh access`, and logged the larger Connection-step restructure under
  the wizard CSS polish milestone.

Verification:

- `node --check scripts/voidware_app_broker.mjs && node --check web/app.js`
- `python3 -m py_compile scripts/voidware_auth.py scripts/config.py server.py tests/test_voidware_auth.py`
- `python3 -m unittest tests.test_voidware_auth -v`
- Live `/api/provider` fake-key write returned `403` with Voidware approval
  metadata; `~/.shxdow/config/shxdow.llmdash.json` did not contain the fake key.
- OpenTabs screenshots under
  `artifacts/browser-sessions/2026-05-27-opentabs-todo/`.
- Live saved-key approval completed with `OPENAI_API_KEY`; test connection
  returned HTTP 401 from the provider, not another Voidware approval error.
- Live new-key write approval completed; config contained no `api_key`, no
  fake `sk-llmdash-approved-new-key-20260527`, and no `sk-` marker.

Residual follow-up:

- Re-run the wizard-owned new-key advance path once OpenTabs input/click
  handling is stable enough to keep the API key field populated through
  rerenders. Backend save, approval, expiry recovery, and config safety are
  covered.

---

## Entry 086 — 2026-05-27

**Agent:** GPT-5 Codex
**Cycle:** Phase 9.7 follow-up
**Task:** Task board cleanup and follow-up status update

---

Condensed and restructured `TODO.md` for the remaining Phase 9.7 follow-up work.

- Reduced the 9.7 follow-up block to verification-only tasks.
- Updated the active checklist to three concrete items: saved-key wizard capture,
  Settings renewal/recovery copy checks, and fallback-policy revisit.
- Reframed the historical aborted walkthrough notes into a short evidence note.

No code or runtime behavior changed in this pass.

---

## Entry 085 — 2026-05-27

**Agent:** GPT-5 Codex
**Cycle:** Phase 9.7 follow-up
**Task:** Functional verification and OpenTabs smoke run

---

Completed a focused OpenTabs verification pass for credential-source behavior and
core provider/schedule-style API flows, with emphasis on runtime behavior over
CSS layout.

- Confirmed OpenTabs MCP/CLI is running and connected; navigated LLM-Dash at
  `127.0.0.1:8787`.
- Ran an isolated fallback instance on `127.0.0.1:8789` to exercise non-bridge
  mode (`LLM_DASH_SHXDOW_ROOT` overridden, `PATH=/nonexistent`), verified:
  - `provider.source` transitions to `voidware-keystore`
  - UI chip text now reads `Saved in Voidware`
  - `/api/provider/credentials` / provider/voidware endpoints return expected shapes
- Ran provider workflow checks:
  - `POST /api/provider` (stores fallback secret)
  - `DELETE /api/provider/key` (removes key)
  - `GET /api/provider`, `/api/voidware/broker`, `/api/provider/models`,
    `/api/provider/test-connection`, `/api/provider/credentials`
  - `GET /api/llmstats/test-connection`
- Ran Voidware approval-path checks on full app:
  - `POST /api/voidware/broker/grant` produced pending state
  - `/api/voidware/broker/approval` surfaced pending payload
  - `POST /api/voidware/broker/approval/deny` returned `approval_denied`
- Captured proof screenshots:
  - `/artifacts/opentabs-verify-llmdash-provider.png`
  - `/artifacts/opentabs-settings-8787.png`

Verification commands used:

- `curl` checks against `/api/provider*`, `/api/voidware/broker*`, `/api/llmstats/test-connection`
- OpenTabs page checks (`browser_get_tab_content`, `browser_list_tabs`, `browser_screenshot_tab`)

---

## Entry 084 — 2026-05-27

**Agent:** GPT-5 Codex
**Cycle:** Phase 9.7 follow-up
**Task:** Clarify saved-key source wording as Voidware-managed

---

Adjusted credential source labeling so local keyring-backed credentials are
presented as Voidware-managed rather than legacy.

- Backend `scripts/config.py`: `_credential_source()` now reports `"voidware-keystore"`
  instead of `"keyring-legacy"` when reading from the local keyring, keeps the
  source precedence updated, and changes fallback-save messaging to
  “secure local fallback failed”.
- Frontend `web/app.js`: `authSourceLabel()` maps `"voidware-keystore"` to
  “Saved in Voidware” and maps `"keyring-legacy"` to “Saved in Voidware secure
  store” for compatibility with older payloads.

Verification:

- `python3 -m py_compile scripts/config.py scripts/voidware_auth.py`
- `python3 -m unittest tests/test_voidware_auth.py -v`

---

## Entry 083 — 2026-05-27

**Agent:** GPT-5 Codex (silkforge, implementation)
**Cycle:** Phase 9.7 Voidware app-owned approval
**Task:** Implement saved-credential approval bridge and modal

---

Implemented Phase 9.7 from
`docs/plans/2026-05-26-voidware-0-9-10-app-approval-plan.md`.

- Vendored Voidware CSS from local `0.9.10` source at commit `a5c3aae` and
  updated `web/vendor/voidware/VERSION.md`.
- Added `scripts/voidware_app_broker.mjs`, a Node JSON worker that imports the
  built Voidware CLI service module, starts an app-owned broker when possible,
  exposes pending approvals, and routes saved-key grant requests through
  Voidware's official `voidware-client-grants` durable cache.
- Added the Python bridge controller in `scripts/voidware_auth.py`, FastAPI
  approval endpoints, bridge shutdown cleanup, and metadata-only grant API
  responses.
- Replaced the old wizard “approve elsewhere” flow with an LLM-Dash approval
  modal for saved Voidware credentials.
- Updated README, architecture, development docs, and condensed `TODO.md`.

Verification:

- `node --check scripts/voidware_app_broker.mjs`
- `node --check web/app.js`
- `python3 -m py_compile server.py scripts/*.py tests/*.py`
- `python3 -m unittest tests.test_voidware_auth -v`
- `python3 -m unittest discover -v`
- Temp-root bridge smoke with `LLM_DASH_VOIDWARE_SKIP_KEYRING=1` confirmed
  `approvalSurface: "app"` and `canApprove: true`.
- Headed `agent-browser` probe on `http://127.0.0.1:8787` confirmed the wizard
  saved-key selection renders the new `Approve Access` card without console
  errors. Screenshot:
  `artifacts/browser-sessions/2026-05-27-phase-9-7/saved-key-connection.png`.

Pro nano-agent review completed via Cursor `auto`. It flagged two actionable
items, both fixed: `approval_waiting` can no longer be treated as success, and
the approval modal now supports `secretRequired` challenges as well as
password-required approvals.

Residual follow-up:

- Run the headed saved-key wizard walkthrough with fake/temp credentials and
  capture approval-modal screenshots.
- Browser-check Settings > Provider renewal/conflict copy.
- Decide whether the env/keyring-only fallback should stay long term.

---

## Entry 082 — 2026-05-26

**Agent:** GPT-5 Codex (lumenweld, planning)
**Cycle:** Voidware 0.9.10 validation and app-owned approval plan
**Task:** Validate newest Voidware features and write the LLM-Dash integration plan

---

Validated local Voidware `0.9.10` from `/home/phxntom/Repos/voidware`.

- `python3 ~/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/voidware` auto-synced the installed `voidware-spec` skill to `0.9.10`.
- Voidware repo was clean on `main` at `a5c3aae` with tags `v0.9.10`, `v0.9.9`, and `v0.9.8`.
- `npm run verify:fast` passed in the Voidware repo.
- `npm run smoke:broker:ipc` passed in the Voidware repo.

Verdict: Voidware has the features LLM-Dash needs. `0.9.9` shipped the missing
app-owned broker approval surface for browser + local-server apps, and `0.9.10`
adds Dev-scoped auth tokens for later agent-access work.

Added reviewed implementation plan:
`docs/plans/2026-05-26-voidware-0-9-10-app-approval-plan.md`.

Pro nano-agent plan review completed through the `auto` Cursor route. Findings
were folded into the plan, especially async approval protocol, shared
`ServiceContext`, detached broker conflict UX, bridge status semantics, Node
build prerequisites, shutdown cleanup, and tests.

Updated `TODO.md` so the saved-key wizard issue is no longer listed as an
upstream Voidware blocker. It is now Phase 9.7 implementation work.

Residual risks:

- LLM-Dash needs a small Node bridge because the app-owned broker API is
  exported by `@shxdowcollective/voidware-cli`.
- Existing detached brokers with `canApprove: false` can still block in-app
  approval until the user stops or replaces them.
- The CSS bump from `0.9.8` to `0.9.10` touches active rings, status chips,
  selects, tooltips, and fonts, so screenshot QA is required during
  implementation.

---

## Entry 081 — 2026-05-19

**Agent:** Cursor (dev-browser walkthrough)
**Cycle:** Fresh wizard walkthrough
**Task:** Abort walkthrough — Voidware broker approval gap

---

Aborted the headed setup wizard test. Saved Voidware credentials cannot complete
Connection test without an approval surface Voidware does not expose to
browser + local-server apps.

Findings:

- Failure mode: `approval_required` / broker message requiring interactive TTY
  or an existing grant when the local broker has `approvalSurface: none` and
  `canApprove: false` (headless `auth broker start --app llm-dash`).
- Voidware’s supported integrator paths are **Voidware manager (Electron)** or
  **foreground TTY broker**; no embeddable dialog/package for LLM-Dash to collect
  auth password and mint `vwgr_...` inside the app UI.
- LLM-Dash changes in this session (stop headless autostart, `/api/voidware/broker`,
  wizard **Authorize access**, clearer errors) improve messaging but do not remove
  the upstream dependency.

Handoff:

- Voidware `TODO.md`: **Milestone 8 — Auth Broker Approval for Third-Party Local
  Apps**; Voidware `LOGBOOK.md` Entry 055.
- LLM-Dash `TODO.md`: walkthrough marked aborted; CSS milestone paused.

Artifacts retained:

- `artifacts/browser-sessions/2026-05-18-fresh-wizard/`
- `artifacts/browser-sessions/2026-05-19-wizard-walkthrough/06-credential-chip-user-file.png`

---

## Entry 080 — 2026-05-19

**Agent:** GPT-5 Codex (cinderbloom, dev-browser)
**Cycle:** Fresh wizard walkthrough support
**Task:** Launch a clean dev session and fix first-run wizard blockers

---

Started a fresh local walkthrough session for the setup wizard.

- Reset generated local app state with `scripts/reset_local_state.py`, removing
  the old dashboard DB, metrics CSV, LLM-Dash provider/schedule config, and
  generated run logs.
- Relaunched FastAPI on `http://127.0.0.1:8787` and opened a headed
  `agent-browser` session for screenshot-backed feedback.
- Captured wizard screenshots under
  `artifacts/browser-sessions/2026-05-18-fresh-wizard/`.
- Fixed the Voidware broker path: LLM-Dash now autostarts the auth broker with
  the resolved CLI command instead of surfacing `broker_unavailable` when the
  socket is missing.
- Added a narrow legacy keyring fallback for provider, Exa, and LLM Stats
  secret save/delete when the broker or CLI is unavailable.
- Reworked first-run loading polish: static boot state and JS placeholders now
  use spinner-only loading, hide the dashboard shell while booting, keep
  `data-booting` until ready/wizard/error, and center the spinner against the
  viewport.
- Removed the wizard step-1 load jump by rendering only a centered spinner while
  wizard presets, credentials, and schedule data load; the full title/progress/
  form/footer render together once ready.

Artifacts:
- `artifacts/browser-sessions/2026-05-18-fresh-wizard/01-wizard-connection.png`
- `artifacts/browser-sessions/2026-05-18-fresh-wizard/02-wizard-no-nav-flash.png`
- `artifacts/browser-sessions/2026-05-18-fresh-wizard/03-wizard-boot-spinner.png`
- `artifacts/browser-sessions/2026-05-18-fresh-wizard/04-centered-boot-spinner.png`
- `artifacts/browser-sessions/2026-05-18-fresh-wizard/05-wizard-stable-step1-load.png`

Verification:
- `python -m unittest tests.test_voidware_auth`
- `node --check web/app.js`
- Headed `agent-browser` reload/screenshot/snapshot passes on the setup wizard.
- Direct broker status check: broker available at
  `~/.shxdow/tmp/auth-broker/1000.sock`.

Residual notes:
- CSS feedback is still being gathered live; final TODO/CSS milestone updates
  are intentionally deferred until the walkthrough is done.
- `LOGBOOK.md` is over the usual split threshold and should be archived after
  this active review loop, not mid-walkthrough.

---

## Entry 079 — 2026-05-18

**Agent:** GPT-5 Codex (glassquill, shxdow-flow)
**Cycle:** Dashboard nav and portrait layout polish
**Task:** Remove compare/trend dashboard clutter and rebuild portrait Models layout

---

Polished the Models dashboard and Changelog surfaces after the scoring update.

- Simplified the sidebar brand to `LLM-Dash` and removed the `Workspace` and
  `Model Benchmarks` subtitles.
- Changed the Models page header to kicker `Models` and title `Dashboard`.
- Removed the visible Changelog Compare tab and deleted the now-unreachable
  Compare helper/UI CSS.
- Removed the main Models table Trend column/sort remnants while keeping model
  detail history charts intact.
- Added iridescent outlines/tinted active states to the Table/Chart picker and
  Sort controls.
- Reworked Settings > Models into a centered compact two-column form.
- Added a portrait Dashboard card list so 1080x1920 hides the wide table and
  shows tappable model cards with Overall/Value/Cost and metric summaries.
- Added plan: `docs/plans/2026-05-18-dashboard-mobile-nav-refresh.md`.

Verification:
- `node --check web/app.js`
- `python3 -m unittest discover -v`
- `git diff --check`
- Headed `agent-browser` probes at `1920x1080` and `1080x1920`: confirmed no
  Trend column, no Changelog Compare tab/body, corrected nav/header copy,
  colored picker styling, centered Settings Models panel, portrait card layout,
  and no horizontal overflow or page errors.

---

## Entry 078 — 2026-05-17

**Agent:** GPT-5 Codex (glassquill, shxdow-flow)
**Cycle:** Models dashboard scoring polish
**Task:** Update Agent wording, score weights, and formula tooltip

---

Updated the Models dashboard scoring presentation.

- Renamed visible `Tool Use` labels to `Agent` across the Models table, chart
  legend, filters, detail panels, model reports, and CSV export.
- Changed Overall from an even average to a weighted score: 30% intelligence,
  30% coding, 30% agent capability, and 10% speed.
- Changed Value from an even Overall/Cost average to 80% Overall and 20% cost.
- Moved the formula/source explanation out of the footer into a focused `?`
  tooltip beside the CSV download button, while keeping the tier legend visible.
- Updated README, Architecture, and TODO notes for the new scoring expectation.

Verification:
- `node --check web/app.js`
- `python3 -m unittest discover -v`
- `git diff --check`
- Headed `agent-browser` probe on Models table: confirmed Agent table/header
  wording, no old formula footer text, tooltip content/hover visibility,
  weighted first-row Overall `9.3`, weighted Value `8.4`, no body horizontal
  overflow at desktop and 768px widths, and no browser console/page errors.

---

## Entry 077 — 2026-05-17

**Agent:** GPT-5 Codex (nightglass, shxdow-flow)
**Cycle:** Phase 9.6 — Voidware 0.9.8 Upgrade
**Task:** Upgrade vendored Voidware CSS, sync workspace skills, and run review gates

---

Completed the Phase 9.6 Voidware upgrade.

- Added the Phase 9.6 plan under `docs/plans/` and ran a pro nano-agent plan
  review before implementation.
- Updated vendored Voidware provenance to `0.9.8` and copied the only changed
  CSS payload, `buttons.css`, from the current local Voidware source.
- Refreshed visible Voidware docs references in README, Architecture, and
  Development.
- Synced stale `voidware-spec` skill mirrors to `0.9.8` across WSL, Windows,
  ShxdowDocker, ShxdowMac, and the shxdowSkills master copy.
- Aligned route navigation with the current spec by removing route-level
  `aria-pressed`, keeping `aria-current`, and mirroring `data-vw-open` on the
  sidebar backdrop.
- Fixed visual-review findings: the mobile drawer now has an internal close
  button with full nav labels, and the narrow Models table has a stronger
  right-edge overflow cue.
- Completed the follow-up Models dashboard font-role pass: table headers,
  list/chart model names, status/tier labels, and filters now use the body font,
  while compact numeric score/rank values use tabular monospace for fast
  scanning alongside the color bars; the selected model detail title also keeps
  the console font.
- Added a no-horizontal-scroll Models table layout: score bars collapse to
  colored tier letters plus numeric values whenever the actual table lane cannot
  fit the full bar treatment.
- Expanded the desktop app shell to the full viewport, pinning the sidebar to
  the left edge and giving the Models chart/table lane the remaining widescreen
  space instead of a centered max-width frame.
- Reworked the Models Table/Chart control as a fixed-width segmented switcher
  with roomier labels and `aria-pressed` state so the text no longer crowds.
- Centered Models summary-value numerals inside their colored table cells so the
  Overall/Cost/Value columns sit optically even.
- Removed redundant dashboard/sidebar subtitles, changed the Models CSV export
  to an icon-only download button, and combined Advanced Filters with Search in
  one row.
- Switched the app-level body and display font tokens to a Roboto-first sans
  stack so the main dashboard typography has no serif-like face in the active
  cascade.
- Final native review caught the close button inheriting full-width phone
  button styling and the Phase 9.6 plan being ignored by `.gitignore`; both
  were fixed and the focused re-review passed cleanly.

Verification:
- `node --check web/app.js`
- `python3 -m unittest discover -v`
- `python3 -m py_compile server.py scripts/*.py tests/*.py`
- `git diff --check`
- Voidware spec checker with pinned skill `0.9.8`
- isolated Voidware auth/broker smoke with temp `LLM_DASH_SHXDOW_ROOT`
- headed `agent-browser` screenshots at `1280x800`, `768x600`, `1280x640`,
  plus mobile drawer evidence, console/page-error checks, and overflow probes
- follow-up Models font/screenspace probes at `1280x800`, `1280x700`,
  `768x600`, and `1920x1080`
- visual nano-agent review on `opencode-go/kimi-k2.6`, with an alternate
  `opencode-go/qwen3.6-plus` confirmation after one no-final-response retry
- final pro nano-agent attempts stalled without verdict, so final review fell
  back to native review per the requested route; focused native re-review passed

Residual risk:
- The Models table remains intentionally dense at 768px and depends on internal
  horizontal scrolling with explicit visual cues.

---

## Entry 076 — 2026-05-11

**Agent:** GPT-5 Codex (prismhook, shxdowloop-ui)
**Cycle:** Phase 9.5 — SaaS UI/UX Polish
**Task:** Implement final dashboard/settings/wizard UI polish and review gates

---

Finished the Phase 9.5 product polish pass on the shxdowloop branch.

- Replaced sidebar letter glyphs with inline icon affordances and cleaned the
  mobile menu trigger.
- Tightened typography and dense controls, with touch-size restoration at small
  breakpoints.
- Bounded Models, Chart, Changelog, and Stats panels with internal scroll,
  sticky table headers, horizontal affordances, and overflow probes.
- Reworked Settings into clearer Connection, Models, Research, and Schedule
  surfaces with applied/dirty/revert states where save semantics support them.
- Updated setup wizard step titles, service/key copy, URL handling labels,
  schedule preview, and summary language.
- Ran the requested full copy pass: removed `Model Ops`, avoided redundant
  `Settings > Settings`, replaced visible `Agent Provider`/`Agent Tasks`
  wording, and kept protocol terms scoped to key/URL/service controls.

Visual gates:
- Native screenshot review found table, changelog, and access-copy issues; all
  blocking/medium findings were fixed.
- Nano image review on `opencode-go/kimi-k2.6` produced useful findings but also
  read stale draft screenshots; current findings were triaged and fixed.
- Blind final visual confirmation on `opencode-go/qwen3.6-plus` passed against
  the final-only screenshot folder.
- Final native re-review passed with only low residual risks.

Verification:
- `node --check web/app.js`
- `git diff --check`
- headed `agent-browser` screenshots and probes at `1280x800`, `768x600`, and
  representative app routes
- browser console/page error checks
- layout probes: no body horizontal overflow, no clipped controls, bounded
  table scroll, and changelog preview strip horizontal-only on 768x600

Residual risk:
- The Models table remains intentionally dense at 768px and relies on internal
  horizontal scroll.
- Wizard progress is legible at 768px but should be watched below 600px in a
  future true-mobile pass.

---

## Entry 075 — 2026-05-11

**Agent:** GPT-5 Codex (silverthread, docs/spec-planning)
**Cycle:** Phase 9.5 lesson backport to Voidware
**Task:** Review Phase 9.5 docs and add the follow-up milestone in Voidware.

---

Reviewed the active Phase 9.5 TODO item, the latest screenshot-audit logbook
entry, `docs/plans/e2e-analysis/master-issue-list.md`, and
`docs/plans/2026-05-10-polished-saas-ui-ux-plan.md`, then mapped the lessons
against the current `/home/phxntom/Repos/voidware` docs/spec shape.

Added Voidware `TODO.md` Milestone 6, covering the spec follow-up needed so new
Voidware projects start with surface inventory, short-height screenshot gates,
bounded dense data panels, stronger dashboard/chart guidance, typography role
rules, compact workflow controls, settings dirty-state composition, wizard
clarity, and real responsive navigation patterns.

Subagents:
- LLM-Dash explorer extracted the Phase 9.5 source lessons.
- Voidware explorer mapped where the milestone belongs and which spec docs need
  the future changes.

Verification:
- `python3 /home/phxntom/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/voidware`
- Docs-only roadmap/logbook change; no runtime tests needed.

---

## Entry 074 — 2026-05-10

**Agent:** GPT-5 Codex (auroracline, ux-audit)
**Cycle:** E2E screenshot UX audit and polish planning
**Task:** Analyze screenshots and plan polished SaaS UI/UX pass

---

Completed the requested screenshot audit for all 25 PNGs in
`e2e/screenshots/`. Created `docs/plans/e2e-analysis/` with one report per
screenshot plus `master-issue-list.md`, and wrote the nano-agent loop plan at
`docs/plans/2026-05-10-e2e-ux-screenshot-nanoagent-plan.md`.

Review flow:
- main-agent visual pass
- visual nano-agent pass per screenshot
- pro nano-agent code pass per screenshot
- native reviewer pass per screenshot, batched due thread limits
- master synthesis with degraded pro nano-agent retry documented

Wrote `docs/plans/2026-05-10-polished-saas-ui-ux-plan.md` and reviewed it with
native and pro nano-agent reviewers. Folded in corrections around compact
controls, bounded scroll, settings dirty-state scope, wizard credential dedupe,
exact screenshot gates, and before/after comparison.

Updated `TODO.md` with Phase 9.5 as the active implementation follow-through.

Verification:
- `git diff --check`
- `find docs/plans/e2e-analysis -maxdepth 1 -type f -name '*.md' | wc -l`

---

## Entry 073 — 2026-05-10

**Agent:** GPT-5 Codex (violetwire, browser-e2e)
**Cycle:** Phase 9.4 app surface screenshot correction
**Task:** Add missing dashboard and Settings screenshots

---

Corrected the screenshot pass scope after the wizard-only run missed the
actual app surfaces. Reused isolated nonstandard ports with LLM-Dash on
`127.0.0.1:49273` and a fake OpenAI-compatible provider on
`127.0.0.1:49274`, with temp Voidware/shxdow roots and no real secrets.

Added full-page app screenshots under `e2e/screenshots/` for:
- `dashboard-01-models-table.png`
- `dashboard-02-models-chart.png`
- `dashboard-03-changelog.png`
- `dashboard-04-stats.png`
- `settings-01-provider.png`
- `settings-02-provider-manual-expanded.png`
- `settings-03-models.png`
- `settings-04-research.png`
- `settings-05-research-llmstats-expanded.png`
- `settings-06-schedule.png`

Verification:
- `agent-browser errors`
- `agent-browser console`
- screenshot artifact dimension/size check for `dashboard-*.png` and
  `settings-*.png`

---

## Entry 072 — 2026-05-10

**Agent:** GPT-5 Codex (violetwire, browser-e2e)
**Cycle:** Phase 9.4 setup wizard screenshot pass
**Task:** Re-run setup wizard e2e screenshots after provider reuse

---

Re-ran the setup wizard screenshot pass on isolated nonstandard local ports:
LLM-Dash on `127.0.0.1:49173` and a fake OpenAI-compatible provider on
`127.0.0.1:49174`, with temp Voidware/shxdow config roots so no real secrets
or user config were touched.

Captured full-page screenshots for every wizard surface under
`e2e/screenshots/`: provider preset, reusable Voidware credential selection,
selected-credential connection success, custom key setup, advanced provider
options, model selection, model tests, Exa, LLM Stats, schedule off/daily/
weekly/monthly, and review/finish. The taller credential and advanced captures
cover the scrollable states.

Patched a small provider-reuse bug found during the pass: first-run reusable
Voidware credentials now enable **Test Connection** without requiring a typed
API key.

Verification:
- `node --check web/app.js`
- `agent-browser errors`
- `agent-browser console`
- screenshot artifact dimension/size check for `e2e/screenshots/setup-wizard-*.png`

---

## Entry 071 — 2026-05-10

**Agent:** GPT-5 Codex (lumenvein, shxdow-flow)
**Cycle:** Phase 9.4 auth test coverage
**Task:** Add focused Voidware auth/provider tests

---

Added a stdlib `unittest` suite for the Phase 9.4 auth contracts:
Voidware provider discovery filtering/redaction, selected-provider metadata
persistence, broker grant renewal cache state, and v3 encrypted auth-file
compatibility through broker secret reads.

Patched two connected issues while validating:
- `scripts/config.py` now short-circuits credential reads by precedence, so a
  selected Voidware provider does not trigger extra broker fallback reads after
  its secret resolves.
- Provider discovery now scrubs `safeCustom` metadata again before returning it
  to the API, keeping sensitive-looking keys out even if upstream metadata is
  malformed.

Verification:
- `python3 -m unittest discover -v`
- `python3 -m py_compile server.py scripts/config.py scripts/voidware_auth.py scripts/export_metrics_csv.py scripts/init_db.py scripts/launch_server.py scripts/migrate_score_checks.py scripts/reset_local_state.py scripts/run_update.py scripts/schedule_job.py tests/test_voidware_auth.py`
- `node --check web/app.js`
- `git diff --check`

---

## Entry 070 — 2026-05-09

**Agent:** GPT-5 Codex (irisbyte, docs)
**Cycle:** TODO condensation
**Task:** Condense the active roadmap

---

Trimmed `TODO.md` back to active work only: Phase 9.4 now carries the remaining
setup-wizard screenshot pass, the backlog keeps the focused Voidware auth test
follow-up, and completed phases are collapsed into compact one-line history.

Verification:
- Docs-only change; ran diff/whitespace review.

---

## Entry 069 — 2026-05-09

**Agent:** GPT-5 Codex (nyxline, shxdow-flow)
**Cycle:** Phase 9.4 — Voidware 0.8.4 provider reuse
**Task:** Unblock reusable Voidware provider credentials in setup/settings

---

Implemented the Voidware `0.8.4` provider-reuse path now that the shipped CLI
exposes reusable provider discovery and broker grant metadata.

**Patched:**
- `scripts/voidware_auth.py`: added reusable provider discovery, broker secret
  reads that return grant renewal metadata, a keyring-only client grant cache
  for 120-day reuse, and broker status fields for durable grants/secrets plus
  approval surface.
- `scripts/config.py`: removed plaintext `auth.json` secret fallback, added
  selected provider credential name/meta/grant config, metadata-only public
  provider status, redacted reusable credential discovery, and provider secret
  resolution through the broker.
- `server.py`: added `GET /api/provider/credentials`, accepted selected
  provider credential payloads, and tightened provider/LLM Stats error redaction
  so exception paths do not reference undefined secret variables.
- `web/app.js` and `web/style.css`: added reusable credential selectors in the
  setup wizard and Settings Provider page, redacted credential cards, base URL
  and endpoint-mode prefill, renewal-status display, and a 900px responsive
  shell breakpoint so tablet width uses the drawer/header layout instead of a
  clipped sidebar.
- Vendored Voidware provenance moved to `0.8.4` at local commit `15a850a`, with
  the new `--vw-warning-border` token synced.
- Updated `TODO.md`, `README.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT.md`, and the implementation plan.

**Verification:**
- `python3 /home/phxntom/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/voidware` — match at `0.8.4`
- `python3 -m py_compile scripts/voidware_auth.py scripts/config.py server.py`
- `node --check web/app.js`
- `/api/provider/credentials` smoke returned only redacted metadata for
  `KILOCODE_API_KEY` and `OPENCODE_API_KEY`; no secret values.
- Headed browser proof captured selected credential settings at
  `1280x800` and `768x600` under `e2e/screenshots/` (gitignored).
- `agent-browser errors` / `agent-browser console` — no page errors reported
  during the settings proof.
- Keyring grant-cache smoke cleared a malformed `llm-dash-voidware-grants`
  entry and confirmed `shxdow.llmdash.json` does not receive grant tokens.

**Open follow-ups:**
- The first-run setup wizard screenshot pass remains open in `TODO.md`; the
  Settings Provider path now proves the reusable credential selector, prefill,
  and tablet layout.
- The local broker status during verification was `broker_unavailable`, so the
  selected-credential save path was implemented and wired but not exercised
  through a live approval surface.

---

## Entry 068 — 2026-05-09

**Agent:** GPT-5 Codex (sable, investigator/docs)
**Cycle:** Voidware auth provider reuse scoping
**Task:** Record blockers found before the screenshot e2e run

---

Scoped the auth path before running the wizard/app screenshot e2e. The useful
finding: Voidware can enumerate redacted credential metadata, including
reusable provider candidates with `baseURL`, but LLM-Dash only knows how to
read/write/delete fixed app-owned secret names through `scripts/voidware_auth.py`.

Current blocker shape:
- LLM-Dash does not expose a redacted provider discovery endpoint or wizard
  branch for selecting existing Voidware AI provider credentials.
- LLM-Dash still treats legacy `~/.shxdow/auth.json` file entries as plaintext
  `secret` fields. Current Voidware v3 stores encrypted `encryptedSecret`
  envelopes, so metadata is visible through Voidware but the LLM-Dash fallback
  cannot load the secret.
- The app has no grant-token/expiration model yet, so it cannot request a
  120-day scoped broker grant, track renewal, or prompt at the 90-day mark.

Updated `TODO.md` with Phase 9.4 high-level goals and an active backlog note
for focused auth tests plus the pending `e2e/screenshots/` gitignore/e2e pass.

Verification:
- Docs-only change; no runtime tests run.

---

## Entry 067 — 2026-05-08

**Agent:** Claude Opus 4.7 (driftvein, follow-up sweep)
**Cycle:** Phase 9.x post-loop review — out-of-scope follow-ups
**Task:** Address the three items flagged at the bottom of Entry 066:
JSONC-tolerant config loader, overlay-root z-index vs. mobile chrome, and
error-toast ARIA politeness.

---

Two parallel `feature-dev:code-explorer` subagents to scope the fixes:
the config-loader chain (file → parse-fail → wizard auto-open) and the
overlay/drawer/header stacking-context geometry. Both came back with
file:line refs and a recommended fix shape; main-agent did the patches.

**Patched (scripts/config.py):**
- `_read_json` now tries strict `json.loads` first, then falls back to a
  hand-rolled `_strip_jsonc` pass that removes `//` line comments,
  `/* */` block comments, and trailing commas before retrying. String
  contents are preserved (the regex matches whole quoted strings as a
  single alternative and returns them unchanged), so a key like
  `"https://example.com/api"` or `"sk-//notacomment"` survives intact.
- Closes the bug noted in entries 063 and 065: a `~/.shxdow/config/
  shxdow.llmdash.json` written with comments by another Voidware tool
  raised `ConfigError` → HTTP 400 → `fetchProvider()` swallowed it
  silently → `state.provider.has_provider` stayed `false` → `boot()`
  popped the setup wizard on every load.
- No new dependency. The fallback only runs when strict JSON fails, so
  clean config files take the fast path.

**Patched (web/style.css):**
- `#overlay-root` z-index bumped from `20` to `100`. Mobile chrome lives
  outside the overlay-root stacking context — `.app-sidebar` at `90` and
  `.mobile-shell-header` at `80` — so opening any modal (run-update,
  manual-refresh, help) on a small viewport while the drawer was visible
  used to paint the modal under the drawer/header. The single value
  change clears both. Added an inline comment at the bump site so the
  next contributor doesn't undo it.

**Patched (web/app.js):**
- `showToast`: when `tone === "error"` or `"warning"`, the per-toast div
  now sets `role="alert"` and `aria-live="assertive"` to override the
  container's polite default. Success/info toasts continue to use the
  container's `role="status" aria-live="polite"`. This way reload
  failures and the like surface immediately to assistive tech instead of
  waiting for the user to finish their current action.

**Verification:**
- `node --check web/app.js` — passed
- `python3 -m py_compile scripts/config.py server.py` — passed
- `git diff --check` — no whitespace issues
- JSONC parser unit smoke (6 cases): clean JSON round-trips; line
  comments stripped; block comments stripped; trailing commas allowed in
  arrays and objects; strings containing `//`, `/*`, and escaped quotes
  preserved verbatim. All 6 pass.
- End-to-end loader smoke: wrote a JSONC `shxdow.llmdash.json` with line
  comments, block comments, and a trailing comma to a temp
  `LLM_DASH_SHXDOW_ROOT`; `load_provider_config()` returned the expected
  `ProviderConfig` with `base_url`, `default_model`, and
  `request_headers` populated; `public_provider_state()` returned
  successfully (no raise).

**Files touched:** scripts/config.py, web/style.css, web/app.js.

**Open follow-ups (still latent):**
- The `fetchProvider` silent-catch at `web/app.js:1086-1092` masks any
  500-class server error as "no provider configured." That's a separate
  defensive-error-handling cleanup — the JSONC fix removes the most
  likely trigger but the silent catch is still imprecise. Worth a
  targeted `state.provider.lastError` surface in a future cycle.
- No automated test coverage for the config loader. The repo has no
  `tests/` dir today; adding one for this loader (and the credential
  precedence chain) is a real backlog item.

**?** None.

**Checkpoint:** TBD (working tree clean, awaiting user commit).

---

## Entry 066 — 2026-05-08

**Agent:** Claude Opus 4.7 (driftvein, review pass)
**Cycle:** Phase 9.x post-loop review
**Task:** Review the shxdowloop Phase 9.1/9.2/9.3 work with subagents,
implement valid findings, final Codex pass.

---

Three parallel `feature-dev:code-reviewer` subagents on the loop's working
tree (`7be5d26~1..HEAD`): JS correctness on `web/app.js`, CSS/voidware-fit on
`style.css`+`index.html`, and server+plan adherence on `server.py`/docs/TODO.

**Triage:** filtered out three false positives — the `destroyAllDetailUplots`
double-cancel claim (the two loops are sequential synchronous code, no rAF
can fire between them), a speculative `last_updated` string-format mismatch,
and a popstate edge the reviewer itself withdrew. Cosmetic items (route
placement, vendored CSS duplication, voidware token nitpicks) deferred.

**Patched (web/app.js):**
- `moveTableFocus`: added `if (state.focusedRowIndex < 0 && direction < 0) return;`
  so pressing `k` first stays put instead of jumping to row 0.
- `reloadDB`: now resets `state.uiToastShownFor` and `state.uiToastDismissed`
  so a DB reload (e.g. after `--reset`) cannot permanently suppress the
  new-data toast for a previously-dismissed timestamp.
- `yamlScalar`: tightened with a YAML-reserved regex (null/true/false/yes/no/
  on/off/~, signed integers/floats with optional exponent, leading-dot
  fractions, hex, .nan, ±.inf), case-insensitive. Added tab to the special
  class and `?` to the leading-character class. Validated with a spot-check
  matrix — `GPT-5`, `null-model`, `1.5x` stay bare; `null`, `True`, `+1`,
  `1.`, `.5`, `0xFF` get quoted.
- `deriveLeaderboardMetrics`: now reads `group.minDuration` (uncapped)
  instead of recomputing from `group.durations` (capped at 200). Agents with
  >200 timed runs no longer show an inflated minimum.
- Help modal focus management: `state.helpModal.returnFocus = captureFocus()`
  on open; rAF-defer focuses the close button on mount; `closeHelpModal`
  calls `restoreFocus(focusToRestore)`. `state.helpModal` initialized with a
  `returnFocus: null` slot.
- Keydown guard tightened from `state.runUpdate.state === "running"` to
  `state.runUpdate.active`, so `j/k/e/r/?` cannot fire while the run-update
  overlay is in the succeeded/failed reading state. Overlay
  Reload/Close/Retry buttons use direct `onclick` handlers, unaffected.
- Leaderboard `renderHeaderCell`: emits `aria-sort="ascending|descending|
  none"` on each `<th>` based on the active sort key + direction.

**Patched (server.py):** `/api/meta` now sets `Cache-Control: no-store` via
an injected `Response` (imported from fastapi). Closes the gap where the
client polled with `cache: "no-store"` but the server emitted no cache
hints — could let intermediate proxies serve stale data.

**Patched (docs/ARCHITECTURE.md):** State Management snippet expanded with
`area`/`subview`, `scoreHistory`, `ui`, `selectedModelIds`, `focusedRowIndex`,
`changelogCompare` (`{from,to,active}`), `uiToastShownFor`/`uiToastDismissed`,
and `detailUplots`. Field names verified against the actual `state` init
block at `web/app.js:140`–`170`.

**Patched (TODO.md):** Phase 9.1/9.2/9.3 sections rotated from the active
Phase 9 heading into Completed History as a single condensed entry per
milestone, matching how every prior phase was handled and what the three
9.x plans explicitly required on close.

**Codex final review (codex:codex-rescue):** confirmed 7/10 patches,
flagged 3 follow-ups: yamlScalar missing case-insensitivity and edge
numeric forms (`+1`, `1.`); ARCHITECTURE.md state snippet had two field
mismatches (`selectedModel` → `selectedModelIds`, `changelogCompare.tab` →
`changelogCompare.active`); help-modal focus restore was already correctly
passing the snapshot to `restoreFocus()`, just asked me to verify (it does).
All three folded back in. Re-verified with `node --check`, `py_compile`, and
the regex spot-check.

**Verification:**
- `node --check web/app.js` — passed
- `python3 -m py_compile server.py` — passed
- `git diff --check` — no whitespace issues
- yamlScalar regex spot-check matrix (24 inputs) — output matches intent
- Diff stat: 4 files, +62 -65 (TODO net shrinks; rest are surgical)

**Files touched:** web/app.js, server.py, docs/ARCHITECTURE.md, TODO.md.

**Open follow-ups (out of scope, flagged for next cycle):**
- Help-modal/run-update overlay z-index: both live inside `#overlay-root`
  (z-index 20). On mobile, the sidebar drawer (z-90) and header (z-80) live
  outside that root and would paint over any modal that opens during a
  drawer slide. The existing wizard/manual-refresh overlays share the same
  constraint and have not actually broken in practice, so this is a class
  of latent risk rather than a regression introduced here.
- Toast container uses `role="status" aria-live="polite"` for all tones;
  error toasts in particular should switch to `role="alert"` /
  `aria-live="assertive"` for assistive tech.
- Pre-existing `~/.shxdow/config/shxdow.llmdash.json` JSON-with-comments
  parse failure noted in entries 063/065 — still a real bug, still out of
  scope.

**?** None.

**Checkpoint:** TBD (working tree clean, awaiting user commit).

---

## Entry 065 — 2026-05-08

**Agent:** Claude Opus 4.7 (shxdowloop-9x, shxdowloop main agent)
**Cycle:** Phase 9.x — shxdowloop, Stage 3 of 3
**Task:** Implement Phase 9.2 — Power-user UX (keyboard shortcuts,
`/api/meta`, 15s auto-poll + new-data toast).

---

Final stage of `shxdowloop/2026-05-08/phase-9-remaining-todos`. Closes the
Phase 9.x backlog.

**Implementation (server.py, web/app.js, web/style.css, web/index.html):**
- New `GET /api/meta` route in `server.py` returning
  `{"last_updated": ...}`. Declared **before** the `/` static mount so the
  catch-all doesn't shadow it. Body reuses the existing `_last_updated()`
  helper.
- Top-level keydown handler rewritten to keep the existing Escape behavior
  intact, then add layered guards (no modifiers, no editing target, no
  wizard, no bootstrap, no manual-refresh modal, no run-update overlay,
  no help modal). Behind the guards: `/` focus search (expands the filter
  panel if collapsed), `j/k` row nav with `state.focusedRowIndex` (reset
  on filter/sort via `refreshModels`), `e` export the single selected
  model's report (reuses Stage 2 builder), `r` refresh (calls
  `triggerRefresh` which re-applies the same guards as the sidebar
  Refresh button), and `?` opens the help modal. `j/k/e` are gated when
  the mobile drawer is open.
- `?` button added to the sidebar footer (`web/index.html`); button click
  is guarded against opening behind the run-update overlay.
- Toast primitive on the previously-unused `.vw-toast-*` voidware classes.
  `showToast({ message, tone, actionLabel, onAction, onDismiss })` returns
  a handle with `dismiss()`. `showNewDataToast(serverLastUpdated)` is the
  consumer: dedupes on `state.uiToastShownFor`, suppresses re-arming for
  a payload the user already dismissed via `state.uiToastDismissed`,
  supersedes any prior toast on a newer payload. The action handler calls
  `reloadDB()` + `loadStaticState()` + `updateFreshness()` + `render()`
  in place — no page reload.
- 15-second `checkForNewData()` interval is wired in `boot()` and skips
  ticks while a run-update is active or the tab is hidden. A
  `visibilitychange` listener triggers an immediate check when the tab
  becomes visible.

**Reviewer pass (`feature-dev:code-reviewer`) — fixed before checkpoint:**
- **Critical**: `onDismiss` previously fired on the action-click path,
  poisoning `uiToastDismissed` so a failed `reloadDB()` would silently
  prevent further toast re-arming for the same payload. Fixed by
  threading an `actionTaken` flag through `showToast.dismiss(viaAction)`
  and `onDismiss(actionTaken)`; the new-data toast only marks dismissed
  when the user did NOT take the action.
- **Important**: Help modal's `.help-modal-backdrop { z-index: 60 }` is
  below the run-update overlay, and the `?` sidebar button had no guard
  for active runs. Could open an invisible inaccessible modal. Fixed by
  guarding `openHelpModal()` against `state.runUpdate.active`,
  `state.bootstrap.state === "initializing"`, and an open
  `state.manualRefreshModal`.
- **Important**: Plan called for `j/k/e` to be inert while the mobile
  drawer is open. Added `state.ui.sidebarOpen` short-circuit inside each
  case; `/` and `r` still fire (closing the drawer + focusing search is
  useful, refresh is global).
- **Help text**: `?` was a working shortcut but missing from the modal's
  list. Added `{ keys: ["?"], label: "Open this shortcuts modal" }`.

**Verification:**
- `node --check web/app.js` passes.
- `python3 -m py_compile server.py` passes.
- `curl http://127.0.0.1:8765/api/meta` returns the expected JSON.
- `agent-browser` headed at 1440x900: clicking `?` opens the help modal
  (8 entries); pressing Esc closes it; pressing `/` focuses the search
  input; `j/k` walk the visible Models rows by id; `r` triggers a refresh
  through the same path as the sidebar button; bumping `meta.last_updated`
  in the SQLite file produces a "New data available" toast within ~15s
  with a working Reload action that swaps state in place; dismissing the
  toast prevents re-arming for the same payload but a *newer* payload
  re-arms correctly. Screenshots in `artifacts/phase-9-2-power-user-ux/`.

**Files touched:** server.py (1 route), web/app.js (~330 lines added),
web/style.css (~140 lines added), web/index.html (`?` button), plus
TODO.md, docs/ARCHITECTURE.md, this LOGBOOK, and the loop process plan.

**Open follow-up:** the user's `~/.shxdow/config/shxdow.llmdash.json` has
JSON line comments which the server can't parse, so the wizard
auto-opens for them too. Out of scope here — flag as a separate cleanup.

**Checkpoint:** TBD (committing this stage now).

---

## Entry 064 — 2026-05-08

**Agent:** Claude Opus 4.7 (shxdowloop-9x, shxdowloop main agent)
**Cycle:** Phase 9.x — shxdowloop, Stage 2 of 3
**Task:** Implement Phase 9.1 — Data exploration (sparklines, DetailPanel
trend chart, Changelog Compare tab, Markdown report export).

---

Stage 2 of the `shxdowloop/2026-05-08/phase-9-remaining-todos` branch. Largest
of the three stages — touches state, the Models table, the DetailPanel, the
Changelog area, and adds a routing extension for share-links.

**Implementation (web/app.js, web/style.css):**
- `state.scoreHistory: Map<modelId, Array<row>>` populated in
  `loadStaticState()` from a single `model_scores` query (~46 rows in seed,
  <150 KB at full scale).
- New helpers `avgOverallRow`, `modelHistory`, `modelOverallSeries`,
  `sparkDelta`. `sortKey` extended with `"trend"` so the existing sort-bar
  picks up a Trend button alongside Overall/Value.
- `renderSparkline()` builds inline SVG via `innerHTML` on a wrapper span
  (the existing `h()` hyperscript is HTML-namespace only — verified via
  `document.createElement` in `h`). Sparkline color comes from
  `--vw-iridescent-3/5/7` based on last-vs-prev delta. Empty-state em-dash
  preserves column width.
- New `Trend` column in `renderTable()`, hidden under `@media (max-width:
  760px)`. 46 sparklines mount; populated ones render successfully (only
  `model_id=1` has 2+ history points in seed).
- Multi-series uPlot for the DetailPanel: new helper
  `renderMultiSeriesChart()` (the existing `renderUplotChart()` is
  single-series). Mount id pattern `detail-chart-${modelId}`. Stored in
  `state.detailUplots` so the Stats `scheduleChartDraw()` doesn't wipe them.
  Lifecycle wired via `renderSingleModelCard` (schedule on every render),
  `toggleModelSelection` (destroy on deselect), and `scheduleChartDraw`
  (destroy + cancel pending rAFs when leaving Models area).
- `parseHashRoute` and `hashForRoute` extended to support `?key=value`
  segments. Legacy `#table` / `#changelog` etc. still resolve. Compare tab
  state is round-trippable via `#changelog?tab=compare&from=&to=`.
- Compare tab inside `renderChangelog()`: `Read | Compare` segmented at the
  panel head; from/to date pickers populated from `state.changelogs`;
  three-section diff (`New models`, `Score changes`, `Status changes`)
  computed by `diffChangelogs(fromDate, toDate)`. Score `from` value is
  resolved via `lookupPriorScore` (latest `model_scores` row strictly before
  the changelog date for that model+field).
- Markdown export: `buildModelReport(model)` returns a string with YAML
  frontmatter, latest scores table, full history table, and up to 8
  citation blocks pulled from changelogs that mention the model.
  `extractModelMentions` is a line-by-line scanner with heading-context.
  `downloadModelReport` does a Blob + anchor click; filename is
  `${slug}-report.md`.

**Reviewer pass (`feature-dev:code-reviewer`) — fixed before checkpoint:**
- **Critical**: `destroyAllDetailUplots` did not cancel pending rAFs, so a
  view switch could let a queued frame fire after destruction and leak a
  rogue uPlot. Now cancels every `state.detailChartFrames[*]` first, then
  destroys instances. `destroyDetailUplot` also cancels its model's frame.
- **Important**: `lookupPriorScore` did `row[field]` without validating
  `field` against `METRIC_KEYS`, so a typo'd field in `changed_json` would
  silently pin `from: null` forever. Now early-returns `null` for unknown
  fields.
- **Important**: Markdown export truncation footer (`...older mentions
  truncated`) fired whenever `candidates.length > mentionBlocks.length`,
  even when the reduction came from blockless changelog bodies, not from
  hitting the cap. Added an explicit `truncated` flag set only when the
  cap actually breaks the loop.
- **Important**: YAML frontmatter quoted nothing, so a model name or
  vendor containing `:` would emit invalid YAML. Added `yamlScalar(value)`
  that double-quotes any string with YAML-special characters and escapes
  `\` and `"` inside.

The reviewer also flagged a known `render()`-storm issue (sparkline +
detail chart re-render on every filter keystroke) that the original 9.1
plan acknowledges as out-of-scope for this phase.

**Verification:**
- `node --check web/app.js` passes.
- `python3 -m py_compile server.py` passes.
- `agent-browser` headed at 1440x900: Models table renders Trend column,
  populated sparklines stroke green/blue/pink by delta, DetailPanel
  multi-series uPlot draws against synthetic 5-date history, Compare tab
  renders New models / Score changes / Status changes blocks for the
  Apr 27 → May 1 window, Markdown export downloads with valid YAML
  frontmatter (timestamp colon correctly quoted).
- Narrow viewport (480x900): all 46 trend cells `display: none`.
- Synthetic-data smoke for sparklines + detail chart used 40 inserted
  history rows across 8 models. DB restored from `/tmp/dash.sqlite.bak`
  before checkpoint.

**Files touched:** web/app.js (~700 lines added), web/style.css (~250
lines added), docs/ARCHITECTURE.md, TODO.md, plus this LOGBOOK and the
loop process plan.

**Artifacts:** `artifacts/phase-9-1-data-exploration/` — wide-models.png,
wide-models-trend-right.png, wide-detail-chart.png, wide-compare.png,
narrow-models.png.

**Checkpoint:** TBD (committing this stage now).

---

## Entry 063 — 2026-05-08

**Agent:** Claude Opus 4.7 (shxdowloop-9x, shxdowloop main agent)
**Cycle:** Phase 9.x — shxdowloop, Stage 1 of 3
**Task:** Implement Phase 9.3 — Agent Provider Leaderboard on the Stats page.

---

Stage 1 of the `shxdowloop/2026-05-08/phase-9-remaining-todos` branch. Phase 9.3
landed first because it's independent of 9.1/9.2 and the smallest of the three.

**Implementation (web/app.js, web/style.css):**
- Extended `groupMetricsByAgent` with `durations` (capped at 200), paired
  cost+word sums (`totalCostForWordCalc` / `totalWordsForCostCalc`), and
  per-agent identifiers. Only counts toward paired sums when both `cost_usd > 0`
  and `word_count > 0` are present on the same row.
- Added `median()` and `formatMicroCost()` helpers. `formatMicroCost` falls
  through to `formatCurrency` above $0.01 and renders 4-sig-fig precision below
  ($0.002917 etc.).
- Added `deriveLeaderboardMetrics()` that returns `costPerWord`,
  `wordsPerDollar`, `minDuration`, `medianDuration`, and `fastestEligible`.
  `n ≥ 3` threshold gates fastest-run; below threshold the row gets a
  `vw-status-warning` chip with `n=N`.
- New `renderAgentLeaderboard()` mounts between Averages and Time Series.
  Sortable by Runs, Total cost, Cost / word, Words / $, Fastest run (min).
  Default sort: cost-per-word ascending. Sort persists via existing
  `state.ui.statsLeaderboardSort` -> `UI_STATE_KEY` block.
- Top-3 rank chips (rank-1..3) wired to `--vw-iridescent-1..3`. Highlight
  only fires when ≥3 valued entries exist for the active sort key — avoids
  rewarding a leaderboard of one or two.
- Three summary tiles above the table: best cost/word, most words/$,
  fastest run (best). Each falls back to "—" + a hint line when no group
  qualifies.

**Reviewer pass (`feature-dev:code-reviewer`):**
- Caught: `vw-status-warning` class was referenced in the plan but never
  defined in CSS and never applied in JS. Added the rule next to
  `.vw-status-error` and applied it to all three insufficient-data chips.
- Caught: `minDuration` was tracked independently from the 200-entry
  `durations` cap, so above 200 runs the tooltip's `min` and `median` would
  diverge. Now `deriveLeaderboardMetrics` computes min from the same capped
  array as median.

**Verification:**
- `node --check web/app.js` passes.
- `python3 -m py_compile server.py` passes.
- `agent-browser` headed smoke at 1440x900 and 480x900: leaderboard renders
  between Averages and Time Series, default sort cost-per-word asc, sort
  click rotates direction and persists, narrow viewport falls back to
  horizontal scroll on the table-wrap.
- Synthetic-data smoke: inserted 3 claude-opus-4-7 + 3 gpt-5 rows with
  positive cost_usd / word_count. Leaderboard correctly populated cost/word
  ($0.006378, $0.002917), words/$ (157, 343), fastest run (2m 50s, 1m 40s),
  rank chips #1..3 with iridescent palette. DB restored after capture.

**Files touched:** web/app.js, web/style.css, docs/ARCHITECTURE.md, TODO.md.

**Artifacts:** `artifacts/phase-9-3-leaderboard/` — wide-1440.png,
narrow-480.png, wide-sorted-runs.png, wide-with-cost.png,
wide-warning-chips.png.

**Open questions for Stages 2 + 3:** The user's `~/.shxdow/config/shxdow.llmdash.json`
has JSON line comments and fails to parse — wizard auto-opens for them too.
Out of scope here, but noted as a real bug to flag separately.

**Checkpoint:** TBD (committing this stage now).

---

## Entry 062 — 2026-05-08

**Agent:** Claude Opus 4.7 (driftwave, shxdow-flow planning pass)
**Cycle:** Phase 9 prep
**Task:** Write detailed execution plans for the active backlog milestones,
have Codex review them, fold suggestions back in.

---

Backlog state coming into this session: Phase 8.12 (docs sync) just wrapped,
Phase 9.1/9.2/9.3 stubs were already promoted to TODO during 8.12 but had no
plans yet. This pass turns each into a ship-ready doc.

**Research route:**
- Three native `feature-dev:code-explorer` subagents (parallel) — one per
  Phase 9 milestone. Returned file:line refs for the Table view, DetailPanel,
  Changelog view, Stats page, `groupMetricsByAgent`, `renderUplotChart`, the
  unused vendor toast CSS, `handleRefresh()`, `applyStoredUIState`, plus the
  exact `run_metrics` and `model_scores` schemas.
- Four parallel Exa searches: SVG sparkline libraries, keyboard-shortcut
  libraries, sql.js IndexedDB persistence patterns, leaderboard statistical
  rigor (CIs, sample-size, error bars on evals).

**Plans written:**
- `docs/plans/2026-05-08-phase-9-1-data-exploration.md` — sparklines (SVG,
  no dep), DetailPanel multi-series uPlot trend chart (new helper, separate
  `state.detailUplots` so the Stats scheduler doesn't wipe it), Compare tab
  inside `renderChangelog()` with hash-state share-links, Markdown
  single-model report with citation extraction from changelog bodies.
- `docs/plans/2026-05-08-phase-9-2-power-user-ux.md` — single global keydown
  handler with input/modal/wizard guards (no library), `state.focusedRowIndex`
  for `j/k` table nav, `r` mirrors `handleRefresh()`, new `/api/meta` route
  declared before the `/` static mount, 15-s visibility-aware poll, toast
  primitive over the unused `vw-toast-*` vendor classes, in-place
  `reloadDB()` swap on click.
- `docs/plans/2026-05-08-phase-9-3-stats-leaderboard.md` — new
  `renderAgentLeaderboard` section between Averages and Time Series, extends
  `groupMetricsByAgent` with `minDuration`/`durations`/paired cost+word
  sums, `formatMicroCost` helper for fractional-cent values, `n ≥ 3`
  threshold for fastest-run, sort persisted in existing `UI_STATE_KEY`.

**Codex review (gpt-5-codex) caught real issues:**
- 9.1: `renderUplotChart` is single-series — required a new
  `renderMultiSeriesChart` helper. Cleanup wiring named a `closeDetailPanel`
  function that doesn't exist (real path is `toggleModelSelection` /
  `renderSingleModelCard`). DetailPanel uPlots would have been wiped by the
  Stats `scheduleChartDraw` if stored in the same `state.uplots` map. The
  diff view assumed `changed_json` was an array of `{model, field, from, to}`
  — actual SQL column shape is `{score_updates: [{name, field, new, ...}],
  status_changes: [{name, to, ...}]}`. Hash state for Compare needed an
  explicit `parseHashRoute`/`hashForRoute` extension.
- 9.2: `r` shortcut linked the wrong line; clarified it routes through
  `handleRefresh()` exclusively, not `openManualRefreshModal`. `/api/meta`
  must be declared before the `/` static mount or it's shadowed. Toast
  de-dupe needed an explicit `uiToastShownFor`/`uiToastHandle` pair.
- 9.3: `formatCurrency` collapses fractional-cent values to `$0.00` —
  added `formatMicroCost`. "Fastest" was inconsistently min vs median
  across header / sort / summary — locked to **min** everywhere, with
  median in the row tooltip. Sort key `llmdash:stats:leaderboard:sort` had
  no load path — folded into existing `UI_STATE_KEY` block.

All Codex findings folded into the plans. Three plans now ready for
implementation.

**Files changed:**
- `docs/plans/2026-05-08-phase-9-1-data-exploration.md` (new, ~310 lines)
- `docs/plans/2026-05-08-phase-9-2-power-user-ux.md` (new, ~270 lines)
- `docs/plans/2026-05-08-phase-9-3-stats-leaderboard.md` (new, ~200 lines)
- `TODO.md` — Phase 9.x sections now link to the plans, and each checkpoint
  carries one-line context cribbed from the plans.
- `LOGBOOK.md` — this entry.

**Verification:**
- `node --check web/app.js` and `python3 -m py_compile server.py` —
  unchanged source, both still pass (sanity).
- Markdown link spot-checks across the three plans and TODO updates — all
  internal references resolve.
- Spot-checked Codex's flagged file:line refs against the live source:
  `handleRefresh` at `web/app.js:1652`, `formatCurrency` at `web/app.js:775`,
  `applyStoredUIState` at `web/app.js:584`, `UI_STATE_KEY` at
  `web/app.js:115`, `changed_json` write site at `scripts/run_update.py:330`
  — all confirmed accurate.

**?** Decision committed in 9.1: Compare lives as an internal tab inside
`renderChangelog()`, not as a global subpage. Decision committed in 9.3:
"fastest run" ranks by `min(duration_sec)`, with `median` reserved for the
tooltip context.

---

## Entry 061 — 2026-05-08

**Agent:** Claude Opus 4.7 (saltline, review pass)
**Cycle:** Phase 8.12 review
**Task:** Subagent review of Phase 8.12 docs-pass commit, fix any drift

---

Ran two parallel reviewers against commit `9f2fc9e` ("8.12"): a code-reviewer
subagent verifying every factual claim added in the docs against HEAD code,
and an Explore subagent doing a fresh drift sweep across the in-scope docs.

**Findings:**
- Code-reviewer: all ten checked claims accurate (schema-version migration
  call sites, `/api/*` endpoints in Settings row, credential precedence,
  Refresh location, `voidware_auth.py` / `migrate_score_checks.py`
  responsibilities, CHECK-constraint failure mode, `llmstats_enriched=true`
  notes flag, wizard-installed scheduled job, TODO Completed History
  summaries).
- Explore: one real omission. `docs/ARCHITECTURE.md` "API Routes" table
  documents every DELETE endpoint except `DELETE /api/provider/key`
  (`server.py:613`, called from `web/app.js:1641`). The 8.12 pass tightened
  this table to add `/api/llmstats` but missed this neighboring route.

**Fixed:**
- `docs/ARCHITECTURE.md`: added `/api/provider/key DELETE` row to the API
  Routes table, grouped with the other provider routes.

**Verification:**
- `git diff --check` — no whitespace issues
- Manual cross-check: every `@app.delete/get/post` decorator in `server.py`
  now has a matching row in the API Routes table.

**?** None.

---

## Entry 060 — 2026-05-08

**Agent:** Claude Opus 4.7 (wxlf, shxdow-flow)
**Cycle:** Phase 8.12
**Task:** Docs and agent contract pass — sync every Markdown surface, condense
TODO into forward milestones

---

Ran shxdow-flow with native subagents for exploration/review, pro nano-agents
(`opencode-go/deepseek-v4-pro`) for bounded doc edits, Codex for final review,
and main-agent integration of every diff.

**Changed:**
- `docs/ARCHITECTURE.md`: added Schema Versioning subsection (v2 + CHECK
  constraints + migration call sites). Refreshed Settings view row to include
  `/api/llmstats` and the real subpage layout. Updated Key Design Decisions
  credential store row to reflect env → broker → keyring → auth-file
  precedence. Tightened Credential storage row label.
- `docs/DEVELOPMENT.md`: added `scripts/voidware_auth.py` and
  `scripts/migrate_score_checks.py` to the backend table. Rewrote Schema
  Changes to point at `migrate_score_checks.py` as the canonical migration
  example and to require wiring into both `server.py` startup and
  `scripts/run_update.py`.
- `README.md`: surfaced `voidware_auth.py` and `migrate_score_checks.py` in
  the Project Layout block.
- `skill/SKILL.md`: switched architecture reference from the frozen
  `IMPLEMENTATION_PLAN.md` to `docs/ARCHITECTURE.md`. Noted that the
  CHECK-enforced 0–10 score range fails transactions, not just the agent
  contract.
- `docs/scheduling.md`: dropped "Phase 7 once it lands" and documented the
  OS-level scheduled job as the supported first-party path with optional
  Phase 8.11 LLM Stats enrichment.
- `docs/update_dashboard.md`: added an Optional Enrichment section pointing
  at LLM Stats and the `run_metrics.notes` (`llmstats_enriched=true`) flag.
- `.github/ISSUE_TEMPLATE/bug_report.md`: replaced the Python 3.13 example
  with a generic `3.10 or newer` prompt.
- `TODO.md`: collapsed Phase 8.10.1 / 8.11 done-checkpoint detail into
  Completed History; promoted nice-to-haves into Phase 9.1 (data
  exploration), Phase 9.2 (power-user UX), and Phase 9.3 (Stats enrichment).

**Verification:**
- `node --check web/app.js` — passed
- `python3 -m py_compile` for `server.py`, `scripts/config.py`,
  `scripts/run_update.py`, `scripts/migrate_score_checks.py`,
  `scripts/init_db.py`, `scripts/voidware_auth.py` — passed
- `git diff --check` — no whitespace issues
- Markdown link sanity script across all in-scope docs — every internal link
  resolves

**Review route:** native explorer subagent for doc-drift audit, native
code-reviewer subagent for plan review (5 actionable findings, all folded
into the plan and executed), pro nano-agents for the six bounded doc passes
(two passes — ARCHITECTURE.md and SKILL.md — finished only part of the
scoped work, so the main agent completed those edits directly), Codex final
review sweep, main-agent final diff review.

**?** None.

---

## Entry 059 — 2026-05-08

**Agent:** GPT-5 Codex (nightglass, review pass)
**Cycle:** Phase 8.11 review hardening
**Task:** Review Phase 8.11 with subagents, fix findings, final review

---

Reviewed Phase 8.11 with backend, frontend, docs, and final-review subagents,
then patched the real findings.

**Fixed:**
- Bumped fresh DB `schema_version` to 2 and made score-check migration compare
  integer versions.
- Added migration execution to direct `scripts/run_update.py` runs, not only
  FastAPI startup.
- Made server startup fail on score migration failure instead of serving stale
  schema.
- Hardened bootstrap readiness to validate the DB instead of trusting file
  existence.
- Validated `--diff-json` updates before writes and made status changes fail
  when the target model does not exist.
- Fixed direct `cd scripts && python3 run_update.py --help` import behavior.
- Preserved provider `request_headers` when Settings saves provider fields.
- Cleared Exa/LLM Stats draft secrets and reveal state on key removal.
- Added wizard step-save guarding and allowed the optional LLM Stats wizard
  step to continue empty.
- Added distinct accessible labels for Provider, Exa, and LLM Stats reveal
  buttons.
- Redacted LLM Stats/provided secrets from test-connection exception details.
- Aligned README, TODO, Architecture, Development, plan, and update-contract
  docs with the actual LLM Stats scope and 0-10 score constraint.
- Narrowed `.gitignore` so the Phase 8.11 plan is no longer hidden.

**Verification:**
- `node --check web/app.js`
- `python3 -m py_compile server.py scripts/config.py scripts/run_update.py scripts/migrate_score_checks.py scripts/init_db.py scripts/voidware_auth.py`
- `git diff --check`
- Migration copy test: first run migrates, second run is idempotent, schema
  version is 2, and score 11 is rejected.
- Bad `--diff-json` status-change probe fails before writing.
- Provider and LLM Stats test-connection exception probes redact injected fake
  secrets from 502 details.
- `cd scripts && ../.venv/bin/python run_update.py --help` succeeds.
- Headed `agent-browser` smoke for Settings > Research with env-only fake
  Provider/Exa/LLM Stats: both research credential sections render, reveal
  buttons have distinct labels, and console/page errors are clean. Screenshot:
  `artifacts/phase-8-11-review/settings-research-fixed.png`.
- Setup wizard opened in first-run mode; provider test failure exposed Skip and
  enabled the next-step path without browser errors.

**Review route:** native subagents for backend, frontend, docs, and final diff.
Final reviewer findings were fixed except for staging state: new files remain
untracked until commit time (`scripts/migrate_score_checks.py` and the Phase
8.11 plan).

**?** None.

---

## Entry 058 — 2026-05-07

**Agent:** Claude Opus 4.6 (shxdow-flow)
**Cycle:** Phase 8.11
**Task:** Optional LLM Stats enrichment + score-range schema hardening

---

Implemented Phase 8.11 end-to-end using shxdow-flow with nano-agent exploration,
native subagent plan review, and Codex final review.

**Changed:**
- Added LLM Stats API key storage to `scripts/config.py` and
  `scripts/voidware_auth.py`, following the existing Exa credential pattern
  (env → broker → keyring/auth-file fallback).
- Added `POST/DELETE /api/llmstats` and `GET /api/llmstats/test-connection`
  endpoints to `server.py`. Updated `_redact_known_secrets` to cover the new key.
- Updated `scripts/run_update.py` to fetch enrichment from LLM Stats
  `/v1/updates` and `/v1/models` when a key is configured, injecting it into the
  agent prompt (capped at 8000 chars). Records `llmstats_enriched=true` in notes.
- Replaced the disabled placeholder in `web/app.js` Settings > Research with a
  functional LLM Stats section (save/remove/test-connection, broker/credential
  status display).
- Added LLM Stats as wizard step 4 (between Exa and Schedule). Wizard now has
  7 steps. All hardcoded step indices were shifted and audited.
- Updated `skill/SKILL.md` to document optional LLM Stats enrichment context.
- Added `scripts/migrate_score_checks.py`: rebuilds `model_scores` with
  `CHECK (col BETWEEN 0 AND 10)` constraints, recreates indexes and the
  `v_models_latest` view, and bumps `meta.schema_version` to 2.
- Updated `scripts/schema.sql` DDL with the CHECK constraints.
- Wired auto-migration into `server.py` startup with logged warnings on failure.
- Wrote implementation plan at `docs/plans/M8_11_LLM_STATS_ENRICHMENT_PLAN.md`.

**Verification:**
- `node --check web/app.js` — passed
- `python3 -m py_compile` for all modified Python files — passed
- `git diff --check` — no whitespace issues
- Migration tested on copy of database: constraints enforced, idempotent
- CHECK constraint rejects score of 11.0 — confirmed
- Wizard step audit: all 17 step-number references verified correct
- No API keys leak through `public_provider_state()` or log tails

**Review route:** native subagent plan review (8 findings, all addressed), Codex
final diff review (2 actionable findings: migration logging improved, Exa
test-connection confirmed as pre-existing gap not a regression).

**?** None.

---

## Entry 057 — 2026-05-07

**Agent:** GPT-5 Codex (vesperline, shxdowloop)
**Cycle:** Phase 8.10.1 Stage 4
**Task:** Complete final verification and evidence capture

---

Completed the Stage 4 evidence pass for the Voidware app-shell phase.

**Verification:**
- `node --check web/app.js`
- `python3 -m compileall server.py scripts`
- `git diff --check`
- Headed screenshots saved under `artifacts/phase-8-10-1-app-shell/`:
  `final-desktop-models.png`, `final-laptop-changelog.png`,
  `final-tablet-stats.png`, and `final-mobile-settings-research.png`.
- Probe results across the four final viewports: no horizontal page overflow,
  no legacy global slots in DOM, no clipped button/status text from the scan,
  and no browser page errors.
- Mobile drawer opened, Tab advanced focus, Escape closed it, and
  `aria-expanded` returned to `false`.
- `/api/provider` and final screenshot artifacts passed redaction scans for
  fake Provider/Exa secrets, `vwgr_`, broker secret targets, and Voidware CLI
  paths.

**Notes:**
- The fake provider deliberately returns 502 for `/api/provider/models` during
  Settings smoke; that path is displayed as normal UI error state and did not
  produce page errors.
- Real Provider, Exa, keyring, broker secret, schedule, changelog, and data
  state were not mutated.

**?** None.

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
