# LLM-Dash — E2E Testing Harness

Headed, screenshot-driven end-to-end testing for the dashboard. Three layers on
one hermetic, deterministic foundation.

## Layers

1. **Functional** (`tests/*.spec.ts`) — drives every surface/button/flow:
   app shell + nav + mobile drawer + help, Models (List/Table/Chart, filters,
   sort, compare, detail rail, CSV export), Changelog, Stats, the five Settings
   subpages (incl. reset gating), and the setup wizard.
2. **Visual regression** (`tests/visual.spec.ts`) — `toHaveScreenshot()` per
   surface × 4 breakpoints (wide 2560×1440, desktop 1440×900, tablet 768×1024,
   mobile 390×844). Baselines live in `tests/__screenshots__/` (committed).
3. **Accessibility** (`tests/a11y.spec.ts`) — axe-core WCAG 2A/2AA. Hard-fails on
   any serious/critical violation (no allowlist). The initial build's findings
   were fixed: small labels use `--vw-text-muted` for AA contrast; model rows are
   focusable containers (not buttons wrapping the compare checkbox); and the
   tablet-portrait drawer no longer collapses to voidware's unlabeled icon rail.
4. **Autonomous audit loop** (`audit/`) — run → classify → (heal) → re-run →
   commit-on-green. See below.

## Determinism

- **Hermetic data:** `global-setup.ts` seeds a throwaway DB via
  `scripts/init_db.py` into `e2e/.tmp/` (honoring `LLM_DASH_DATA_DIR` /
  `LLM_DASH_CHANGELOGS_DIR`). The real `data/` and append-only `changelogs/` are
  never touched.
- **No leaked secrets:** `playwright.config.ts` neutralizes every provider env
  var so the server boots unconfigured — no real keys render into screenshots.
- **Frozen clock + mocked APIs:** `fixtures.ts` pins `Date` (stable relative
  timestamps) and `mocks/api.ts` returns deterministic responses for the
  external/mutating routes; read-only GETs hit the isolated server.

## Commands

```bash
npm run e2e            # full suite (headless by default; headed locally w/ DISPLAY)
npm run e2e:headed     # watch it run
npm run e2e:ui         # Playwright UI mode
npm run e2e:update     # regenerate visual baselines (headless, CI-matched)
npm run e2e:report     # open the HTML report

npm run audit          # SAFE: run → classify → write E2E_AUDIT_REPORT.md (no edits/commits)
npm run audit:dry      # full autonomous loop, but commit is previewed (dry-run)
npm run audit:fix      # FULL AUTONOMOUS: --heal (Claude CLI) + --commit on green
```

## Audit loop (`audit/loop.mjs`)

Safe by default — bare `npm run audit` only detects and reports. Self-healing
and committing are explicit opt-ins because each acts autonomously.

- `--heal` — delegate one fix per failure to the Claude Code CLI (edits only;
  the healer is forbidden from running git).
- `--commit` — on all-green, commit the working tree (never on `main`/`master`;
  aborts if changes touch `changelogs/**` or `data/**`).
- `--dry-run` — preview the commit instead of making it.
- `--headed` — watch (note: visual baselines are headless; diffs expected).
- `--max-iterations=N` (default 5), `--branch=<name>`.

Guardrails: max-iterations + no-progress stop, branch isolation, append-only
protection, healer cannot touch git or history.

## Adding coverage

1. Add/extend a Page Object in `pages/`.
2. Add a spec in `tests/` (prefer ARIA role/name; `data-testid` for ambiguous
   rows/toasts).
3. For new visual surfaces, add a `toHaveScreenshot` case and
   `npm run e2e:update` to capture the baseline; review the PNG diff in the PR.
