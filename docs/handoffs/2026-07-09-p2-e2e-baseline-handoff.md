# Handoff note (RESOLVED) — P2 + E2E baseline refresh, 2026-07-09

Drafted at the >=80% arm rung. Only actioned if binding usage crosses 85% or a hard
usage-limit error fires. If you are reading this as a fallback orchestrator, the
plan contract is `docs/plans/2026-07-09-p2-ux-e2e-baseline-plan.md` — read it fully.

## Resolution — 2026-07-10

The original user pause was resumed by Codex (Nightjar) without a usage handoff.
T-E2E landed as `2fbbf20`; the 28 adjudicated visual baselines and responsive
fixes landed as `bfbf89b`. The permalink type mismatch, a11y exclusions, seed
sidecar staging, synthetic control probes, weak tooltip/filter assertions,
tablet rail squeeze, clipped mobile Settings navigation/model identity, and
mobile Stats density were all closed. Final gates: pytest **190**, frontend node
tests **19**, full functional/a11y/visual E2E **92**, all exit 0. No push, PR, or
deploy was performed. The original pause state below is retained as history.

## Original task
User: "P2 and E2E baseline refresh. ask any open questions, commit when done."
User gates already answered: U1 wire uPlot (not remove); D3 Tabulator spike skipped
(close as keep-hand-rolled); U3 hover disambiguation. Checkpoint commits on
`release`, NO push.

## State at drafting
- Branch `release`, ahead of origin by 8. Last SHA: `f49cddb` (P2 UX implementation
  + review fixes; U1–U7, D1–D2 all shipped and verified: node --check clean,
  `cd web && node --test` 19/19, pytest 190 pass, functional e2e 23/23 on changed
  surfaces).
- Worktree clean at `f49cddb` apart from any in-flight T-E2E nano work.

## Status update: run PAUSED by user 2026-07-09 (not a usage handoff)

The user paused mid-run. T-E2E finished at pause time with its gate GREEN
(59 passed / 2 skipped) but its e2e/ work is UNCOMMITTED. See TODO.md `[~]` item
and LOGBOOK Entry 137 for the authoritative resume state.

## Remaining tracks (in order)
1. **T-E2E validation** (nano work DONE, uncommitted): fix the app bug it found —
   `?m=` permalink id arrives as a string but model ids are numeric, so deep links
   reset in `refreshModels` (`web/app.js` ~:515 / `applyPermalinkModel` ~:4358);
   coerce + un-skip the 2 skipped permalink specs. Then main-agent review of the
   e2e diff and re-run the gate:
   `HEADLESS=1 npx playwright test -c e2e/playwright.config.ts --grep-invert visual`
   exit 0. Then checkpoint commit 2. Known debt flagged (fix or record):
   `.changelog-panel-date` contrast 3.6:1 (axe-excluded), invalid `<dl>` wrapper
   divs in `changelogRunDetails`.
2. **T-BASELINE**: `npm run e2e:update` regenerates all 28 baselines under
   `e2e/tests/__screenshots__/visual.spec.ts/`; adjudicate every fresh capture with
   written verdicts (Voidware gate: hierarchy, contrast, no glow/chip/CTA/card spam,
   responsive integrity); fix in-scope defects; full `HEADLESS=1 npm run e2e` exit 0;
   checkpoint commit 3.
3. **Final**: fresh-context shippability review (pro nano if usage-bound) against the
   plan's verification contract; LOGBOOK.md entry; TODO.md condensed to house format
   (mark P2 + E2E-baseline done, record D3 decision, P3 remains); fix
   `docs/ARCHITECTURE.md` stale "CSS mini-bars" reference; final commit. NO push.

## Validation contract
pytest green; `cd web && node --test` green; full e2e (incl. visual + a11y) exit 0;
no changes to `changelogs/` or `model_scores` history; commits only, no push/PR/deploy.
Mark TODO items `[~] waiting validation from main agent` if you are a handoff agent.

## Usage evidence at drafting
claude session 71 / weekly 81 (binding 81 >= 80 arm; weekly resets Thu 10PM);
codex weekly 93 (ineligible); cursor api 86.1 (<90, eligible); opencode authenticated.
Fallback chain evaluated: codex INELIGIBLE -> cursor ELIGIBLE -> opencode ELIGIBLE.
Chain history: none (zero hops so far).
