# shxdowloop Nanoagent Plan — Phase 9.5 SaaS UI/UX Polish

## Goal

Implement the active Phase 9.5 polish pass so LLM-Dash reads as a finished
Voidware SaaS dashboard: less console-heavy typography, denser controls,
bounded product panels, stronger settings composition, clearer wizard steps,
and verified responsive screenshots.

Primary inputs:

- `TODO.md`
- `docs/plans/2026-05-10-polished-saas-ui-ux-plan.md`
- `docs/plans/e2e-analysis/master-issue-list.md`
- `docs/plans/e2e-analysis/*.md`
- `e2e/screenshots/*.png`

## Preflight Results And Degraded Paths

- Workspace: `/home/phxntom/Repos/LLM-Dash`, read/write OK.
- Git: clean startup on `main...origin/main`.
- Remote: `origin` reachable at `https://github.com/phxntomkid/LLM-Dash.git`.
- Docs: `docs/` and `docs/plans/` writable.
- Runtime: Python `3.13.5`, `.venv` present, `fastapi` and `uvicorn` import OK.
- Frontend tooling: no `package.json`; expected for this zero-build static app.
- Browser tooling: `agent-browser 0.26.0` available.
- Nano-agent wrapper: `/home/phxntom/.codex/skills/nano-agents/scripts/nano-agent.sh`.
- Nano-agent preflight: warmed successfully. Routes selected:
  - flash: `opencode-go/deepseek-v4-flash`
  - pro: `opencode-go/deepseek-v4-pro`
  - image: `opencode-go/kimi-k2.6`
  - alternate vision: `opencode-go/qwen3.6-plus`, `opencode-go/mimo-v2-omni`
- Provider usage from `shxdowTracker`:
  - Claude session 7%, weekly 22%.
  - Codex session 13%, weekly 65%.
  - Neither provider is at or above 70%; native-first routing remains healthy.
- Network/auth prompts: none encountered.
- Degraded paths: none blocking. If browser launch fails, use agent-browser's
  existing headed/CDP fallback and record the exact failure.

## Branch And Remote

- Branch: `shxdowloop/2026-05-10/phase-9-5-saas-ui-ux-polish`
- Base: `main`
- Remote: pushed to `origin` and tracking upstream.
- PR helper URL:
  `https://github.com/phxntomkid/LLM-Dash/pull/new/shxdowloop/2026-05-10/phase-9-5-saas-ui-ux-polish`

## Runtime Budget

No explicit time budget. Stop only for hard blockers: secret exposure risk,
irreversible data mutation, live credential writes, production deploys, or
task ambiguity that cannot be resolved conservatively.

## Helper Routing

- Default route: native Codex subagents for exploration, phase planning, plan
  review, implementation sidecars when write scopes are independent, and final
  screenshot/code review.
- Nano route: read-only nano-agents for visual screenshot reviews and small
  directed checks. User explicitly required a nano-agent visual review and a
  blind visual agent pass.
- Nano queue strategy: sequential by default. Use at most two concurrent tracks
  only if the screenshot sets are independent and a wait would add no value.
- Nano image primary: `opencode-go/kimi-k2.6`.
- Blind screenshot pass: use a different model from the first nano visual pass,
  preferably `opencode-go/qwen3.6-plus`, with screenshot-only context.
- Degraded route: if a nano-agent image pass fails, stalls after the 6-minute
  no-progress floor, or returns unusable output, retry once with the alternate
  vision route before using native review plus main-agent self-review.
- Main agent owns integration, final diff review, verification, commits, and
  pushes.

## Stage Outline

## Stage 1 — Context, Controls, And Typography

**Status:** Complete
**Goal:** Map current UI code and remove the highest-risk typography/control
drift without breaking the zero-build frontend.
**Phases:**
- [x] 1.1 Native explorer maps `web/index.html`, `web/style.css`, and
  `web/app.js` UI surfaces, screenshot targets, and risky state paths.
- [x] 1.2 Native phase planner turns the existing polish plan into ordered
  source edits with verification gates.
- [x] 1.3 Native plan reviewer checks feasibility, scope, and screenshot gate
  coverage.
- [x] 1.4 Main agent implements typography/control cleanup and sidebar icon
  replacement.
**Helpers:** native explorer, native phase planner, native plan reviewer.
**Verification:** `node --check web/app.js`; representative headed screenshot
smoke if layout width changes are substantial.
**Checkpoint:** pending with combined final checkpoint.
**Notes:** Native explorer/planner dispatched. Main-agent local inspection
confirmed low-risk Stage 1 edits: sidebar glyph replacement, step-specific
wizard titles, broader body-font controls, compact dense controls, and reduced
mono usage on headings/helper copy.

## Stage 2 — Dashboard Bounded Panels

**Status:** Complete
**Goal:** Make Models, Chart, Changelog, and Stats feel like bounded app
surfaces instead of long raw pages.
**Phases:**
- [x] 2.1 Compact dashboard filters and clarify control ownership.
- [x] 2.2 Add bounded table/list/chart containers with sticky headers and
  scroll affordances.
- [x] 2.3 Polish Changelog and Stats raw/debug presentation.
**Helpers:** optional native execution sidecar only if a write scope can stay
inside dashboard rendering/CSS.
**Verification:** `node --check web/app.js`; headed screenshots for
`dashboard-01` through `dashboard-04` at `1280x800`, `768x600`, and `1280x640`;
overflow and focus probes.
**Checkpoint:** pending with combined final checkpoint.
**Notes:** Do not modify benchmark data, `model_scores`, or changelog history.
Native plan review found Stage 2 work had started inside Stage 1. The loop now
requires Stage 2 screenshot/overflow/focus verification before checkpoint.
Final probe passed: no body horizontal overflow, no clipped controls, bounded
table scroll, and changelog preview strip horizontal-only at `768x600`.

## Stage 3 — Settings And Wizard Composition

**Status:** Complete
**Goal:** Clean up settings groups, dirty/saved state, optional key states, and
wizard clarity while preserving credential safety.
**Phases:**
- [x] 3.1 Recompose Provider, Models, Research, and Schedule settings groups.
- [x] 3.2 Add or clarify dirty/saved/revert/applied state for settings where
  existing save semantics support it.
- [x] 3.3 Fix wizard step titles, optional-step action hierarchy, endpoint
  preview weight, schedule previews, and review summary.
- [x] 3.4 Full copy pass for Voidware voice: remove sysadmin/ops phrasing,
  reduce debug/protocol language, and keep technical terms only where the user
  is directly editing keys, URLs, or provider details.
**Helpers:** optional native execution sidecar for wizard-only copy/state work
if independent.
**Verification:** `node --check web/app.js`; headed screenshots for
`settings-01` through `settings-06` and all setup wizard targets at `1280x800`,
`768x600`, and `1280x640`; dirty-state and focus probes.
**Checkpoint:** pending with combined final checkpoint.
**Notes:** No new credential write paths, no autosave secrets, no browser/log
secret exposure. User flagged `Model Ops` as anti-Voidware; final copy pass
removed visible `Model Ops`, redundant `Settings > Settings`, `Agent Provider`,
`Agent Tasks`, stale provider/setup labels, and ambiguous key/service wording.

## Stage 4 — Final Screenshot Gate And Handoff

**Status:** Complete
**Goal:** Prove the final UI/UX with syntax checks, browser evidence, native
review, nano visual review, and blind screenshot-only review.
**Phases:**
- [x] 4.1 Run final syntax, whitespace, browser console, and layout probes.
- [x] 4.2 Capture final screenshot set and store artifacts under
  `docs/plans/phase-9-5-saas-ui-ux-polish/artifacts/`.
- [x] 4.3 Native subagent screenshot review with repo/task context.
- [x] 4.4 Nano-agent visual review with image route `opencode-go/kimi-k2.6`.
- [x] 4.5 Blind visual agent pass using a different vision model and only the
  screenshot files as context.
- [x] 4.6 Main agent fixes blocking findings, updates docs/TODO/LOGBOOK/plan,
  reviews final diff, commits, and pushes.
**Helpers:** native screenshot reviewer; nano image reviewer; blind nano image
reviewer on a different model.
**Verification:** `node --check web/app.js`; `git diff --check`; headed
`agent-browser` screenshots; console/page errors; overflow/focus probes;
three review passes clean or documented with fixed findings.
**Checkpoint:** pending commit/push after docs update.
**Notes:** The blind pass receives no repo plan or task context beyond
"review these screenshots for visual/UI defects"; this preserves the requested
fresh-eye signal. Primary nano pass read stale draft artifacts in addition to
the final set, so its current actionable findings were triaged and fixed before
the final native and blind passes. Final native gate passed via `razorblade`.
Blind final confirmation passed via `opencode-go/qwen3.6-plus`.

## Helper Roles And Iteration Stop Conditions

- Explorer stops after returning relevant files, current layout mechanics,
  screenshot surface map, risks, and likely tests.
- Phase planner stops after producing ordered edits by file and phase.
- Plan reviewer stops after actionable plan gaps only.
- Execution helpers, if used, must stay inside their assigned file scopes, must
  not commit, and must report changed files and verification.
- Visual nano-agents stop after actionable screenshot findings. If clean, they
  must say clean and name residual risk.
- Stop final visual loop after one native review, one primary nano image
  review, and one blind alternate-model image review pass are clean or all
  blocking findings have been fixed and rechecked.

## Checkpoint Log

| Stage | Commit | Push | Verification | Notes |
|---|---|---|---|---|
| Branch setup | n/a | Pushed branch | Preflight passed | No edits before approval. |
| 1 | Pending | Pending | Passed | Controls, typography, wizard title, sidebar icons. |
| 2 | Pending | Pending | Passed | Dashboard bounded panels and overflow probes. |
| 3 | Pending | Pending | Passed | Settings, wizard, and copy pass. |
| 4 | Pending | Pending | Passed | Native, nano, and blind visual gates. |

## Verification Matrix

| Area | Required Signal |
|---|---|
| Syntax | `node --check web/app.js` after JS changes and before final commit. |
| Python/server | Run targeted Python checks only if server/backend files change. |
| Whitespace | `git diff --check` before each checkpoint. |
| Browser | Headed `agent-browser`; no page errors, no console errors. |
| Responsive | `1280x800`, `768x600`, and `1280x640` screenshots. |
| Layout | No overlapping controls, clipped text, or unexplained horizontal overflow. |
| Panels | Tables/lists/charts use internal scroll where expected, with focus visible. |
| Copy | No `Model Ops`/sysadmin-ish primary copy; protocol terms stay scoped to editable key/URL/provider controls. |
| Credential safety | No secrets in browser responses, logs, screenshots, docs, or commits. |
| Visual QA | Native screenshot review, nano image review, and blind alternate-model image review. |

## Open Risks

- This is a broad vanilla JS/CSS surface; layout fixes can create regressions
  away from the initially edited screen.
- Bounded panels can trap scroll or hide final rows unless focus and bottom
  padding are checked.
- Settings dirty-state polish must respect existing explicit-save behavior and
  avoid credential autosave.
- Existing screenshots and plans are gitignored artifacts, so final evidence is
  force-added intentionally with the checkpoint commit.

## Merge Readiness Checklist

- [x] App behavior remains local-first and zero-build.
- [x] No benchmark data, changelog history, or old audit files rewritten.
- [x] `TODO.md`, `LOGBOOK.md`, and this plan reflect final state.
- [ ] Final branch has checkpoint commits pushed to origin.
- [x] Screenshot and review artifacts are available under
  `docs/plans/phase-9-5-saas-ui-ux-polish/artifacts/`.
- [x] All blocking review findings are fixed or documented as non-blocking.
