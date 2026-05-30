# Milestone 10 Nanoagent Shxdowloop Plan

**Status:** Complete
**Created:** 2026-05-29
**Branch:** `shxdowloop/2026-05-29/milestone-10`
**Remote:** `origin` / `https://github.com/phxntomkid/LLM-Dash.git`
**Primary handle:** Nightglass

## Goal

Implement Milestone 10: migrate Voidware assets/runtime checks to the pinned
`@shxdowcollective/voidware@1.0.1` package, rebuild the app UI/CSS layer,
verify wizard/settings/approval behavior live with `.env`, and leave the repo
ready for review with TODO and LOGBOOK updated.

Reference plan:
[`docs/plans/2026-05-29-milestone-10-voidware-1-0-1-rebuild.md`](2026-05-29-milestone-10-voidware-1-0-1-rebuild.md).

## Preflight Results And Degraded Paths

- Workspace: `/home/phxntom/Repos/LLM-Dash`, read/write.
- Startup branch: `main...origin/main`, clean.
- Work branch created and pushed: `shxdowloop/2026-05-29/milestone-10`.
- Docs paths: `docs/` and `docs/plans/` writable.
- Git remote: reachable.
- `.env`: readable; do not print or persist secrets.
- `npm`, `node v22.14.0`, `python3 3.13.5`, `gh`, and `agent-browser`: available.
- `shxdowTracker`: Claude session 23%, Codex session 22%, Codex weekly 88%.
  Active helper pressure does not require native fallback, but user requested
  Kilo Pro execution and nano-agent reviews.
- Nano-agent wrapper:
  `/home/phxntom/.codex/skills/nano-agents/scripts/nano-agent.sh`.
- Kilo preflight routes:
  - Pro: `opencode-go/deepseek-v4-pro`
  - Image: `opencode-go/kimi-k2.6`
  - Cursor final review: `auto`
- Degraded path: `kilo auth list` printed a diagnostic, but model refresh and
  route selection completed. If a helper fails, retry once with another
  route/model before doing the work in the main agent.

## Helper Routing

- Main agent owns branch, integration, verification, commits, pushes, and final
  judgment.
- Actual implementation should be delegated to Kilo Pro nano-agents in small,
  auditable phases. Helpers must not commit or push.
- Visual screenshot/contact-sheet review uses image nano-agents with the Kimi
  K2.x route.
- Final code review uses a pro Cursor nano-agent route, with Kilo Pro fallback
  if Cursor fails its route ladder.
- Queue strategy: sequential by default. Use at most two concurrent helper
  tracks only when file scopes are independent.
- Stall rule: do not call a Kilo run stalled until at least 6 minutes pass with
  no observable progress.

## Stage Outline

## Stage 1 — Package Foundation And Runtime Audit

**Status:** Complete
**Goal:** Make Voidware 1.0.1 vendoring and runtime import checks repeatable.
**Phases:**
- [x] 1.1 Add a package-based vendor refresh script and refresh
  `web/vendor/voidware`.
- [x] 1.2 Add package import smoke checks for CSS source and runtime exports.
- [x] 1.3 Audit Voidware runtime bridge guidance and update package-aware docs
  or error text where needed.
**Helpers:** Kilo Pro implementation; main-agent integration.
**Verification:** `npm run verify:voidware`; `node --check scripts/vendor_voidware_css.mjs scripts/voidware_package_smoke.mjs scripts/voidware_app_broker.mjs`; `python3 -m py_compile server.py scripts/*.py tests/*.py`.
**Checkpoint:** `3bdb9b7` pushed to `origin/shxdowloop/2026-05-29/milestone-10`.
**Notes:** Kilo Pro implemented Stage 1. Main-agent review added stale CSS cleanup to the vendor script and removed a no-op smoke block. Static runtime contract preserved; no secrets exposed.

## Stage 2 — CSS/App Layer Rebuild

**Status:** Complete
**Goal:** Rebuild `web/style.css` as a sectioned Voidware 1.0.1 app layer
without breaking existing JS behavior.
**Phases:**
- [x] 2.1 Inventory current selectors and UI surfaces.
- [x] 2.2 Recompose shell, navigation, page headers, dashboard, dense tables,
  charts, changelog, stats, settings, wizard, approval modal, loading, empty,
  error, and drawer states.
- [x] 2.3 Make only scoped JS markup/state-hook changes needed by the CSS
  rebuild.
**Helpers:** Kilo Pro implementation in bounded file scopes; main-agent diff
review.
**Verification:** `node --check web/app.js`; browser smoke at desktop/tablet/
short/mobile widths.
**Checkpoint:** Pending final commit.
**Notes:** Prefer Voidware package classes, but keep app-specific CSS owned by
LLM-Dash. Stage 2 started after Stage 1 checkpoint `3bdb9b7` plus plan-record
commit `7a9316a`. Kilo/Cursor Pro helper passes rebuilt the CSS/app hooks;
main-agent review fixed approval modal pointer handling, Settings approval
state, chart scorecards, and wizard finish behavior.

## Stage 3 — Visual QA And Recommendations

**Status:** Complete
**Goal:** Capture screenshot evidence and run visual nano-agent review on
contact sheets, then implement actionable recommendations.
**Phases:**
- [x] 3.1 Run one headed `agent-browser` session and capture the Milestone 10
  matrix: `1280x800`, `768x600`, `1280x640`, and mobile/drawer widths.
- [x] 3.2 Build contact sheets under `docs/plans/milestone-10/artifacts/`.
- [x] 3.3 Dispatch image nano-agent review and implement confirmed P0/P1 fixes.
**Helpers:** Kimi image nano-agent; main-agent verification.
**Verification:** screenshot dimensions, visible wizard/settings/drawer states,
no overlap/clipping, no blank canvases.
**Checkpoint:** Pending final commit.
**Notes:** Used fake/disposable credential values; screenshots avoid actual
secret contents. Visual nano-agent initially held on `[object Object]` approval
status evidence and stale chart bars; both were fixed and recaptured.

## Stage 4 — Live E2E, Final Review, Docs

**Status:** Complete
**Goal:** Prove the wizard and settings flows with `.env`, pass final code
review, and close docs/checklist work.
**Phases:**
- [x] 4.1 Run live e2e against a local server using `.env` values for wizard
  and all Settings sections.
- [x] 4.2 Dispatch final pro Cursor nano-agent review and fix actionable
  findings.
- [x] 4.3 Run static, Python, unit, and browser verification gates.
- [x] 4.4 Update `TODO.md`, `LOGBOOK.md`, and this process plan.
**Helpers:** Cursor Pro final reviewer; Kilo Pro fallback if Cursor fails.
**Verification:** `git diff --check`, package smoke checks, `node --check`,
`python3 -m py_compile`, `python3 -m unittest discover -v`, live browser
wizard/settings walkthrough.
**Checkpoint:** Pending final commit.
**Notes:** Live `.env` E2E found and fixed OpenCode Zen model-id normalization
and the wizard Finish auto-update surprise. Final pro Cursor nano-agent review
found approval-resume and polling edge cases plus case-sensitive model
normalization; all actionable items were fixed and reverified.

## Verification Matrix

| Gate | Status | Evidence |
|---|---|---|
| `npm ci` | Passed | Kilo Pro ran successfully. |
| Voidware vendor refresh | Passed | `npm run verify:voidware` copied 18 CSS files. |
| Package import smoke | Passed | `npm run verify:voidware` imported `auth`, `auth-templates`, and `logging`. |
| `node --check web/app.js scripts/voidware_app_broker.mjs` | Passed | `node --check web/app.js`; Stage 1 checked helper scripts and broker. |
| `python3 -m py_compile server.py scripts/*.py tests/*.py` | Passed | Re-run after `scripts/config.py` normalization. |
| `python3 -m unittest discover -v` | Passed | 14 tests passed. |
| Headed browser screenshot matrix | Passed | `docs/plans/milestone-10/artifacts/screenshots/` plus contact sheets. |
| Live wizard e2e with `.env` | Passed | Connection 16 models; model test HTTP 200; Finish closes dashboard without update. |
| Settings e2e with `.env` | Passed | Provider connection, Models primary smoke, Research, Schedule. |
| Visual nano-agent review | Passed | Approval/status and bar-free chart rechecks cleared. |
| Pro Cursor nano-agent review | Passed | Fixed interrupted provider-write approvals, Settings approval polling/expiry, post-approval save status, and OpenCode model normalization. |
| `git diff --check` | Passed | Re-run after chart/config/wizard fixes. |

## Checkpoint Log

| Stage | Commit | Push | Notes |
|---|---|---|---|
| Preflight/branch | none | pushed branch | No code changes before proceed. |
| 1 — Package Foundation And Runtime Audit | `3bdb9b7` | Pushed | Kilo Pro implementation reviewed and locally verified. |
| 2–4 — CSS rebuild, visual QA, live E2E | Pending final commit | Pending | Includes bar-free chart scorecards and live `.env` fixes. |

## Open Risks

- Remaining visual polish is P2/P3 only: tablet table first-paint density and
  filter slider wrap can be improved later.
- Approval/wizard screenshots can accidentally reveal secret-adjacent UI; fake
  values were used and actual `.env` contents were not captured.
- Kilo auth diagnostics may make a helper flaky; retry once, then integrate in
  the main agent if needed.

## Merge Readiness Checklist

- [ ] All stage checkpoints are pushed.
- [x] TODO active Milestone 10 tasks reflect done/deferred state.
- [x] LOGBOOK has newest-first entry with helper routing and verification.
- [x] Browser evidence is saved under `docs/plans/milestone-10/artifacts/`.
- [x] No credentials are present in diffs, logs, screenshots, or docs.
- [ ] Final handoff names branch, commits, verification, risks, and PR link.
