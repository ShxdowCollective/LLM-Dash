# Milestone 10 — Voidware 1.0.1 Package Import and CSS Rebuild

**Status:** Planned  
**Created:** 2026-05-29  
**Supersedes:** Phase 9.7 approval walkthrough follow-up and the paused CSS Fix Milestone  
**Primary goal:** Move LLM-Dash to the official `@shxdowcollective/voidware@1.0.1` package, then rebuild the app CSS from a blank app layer against the current Voidware 1.0.1 contract.

---

## Why This Replaces The Old Queue

The previous queue split work into one final approval walkthrough and a narrow wizard CSS polish pass. Voidware 1.0.1 changes the right shape of the work:

- LLM-Dash now has an official package dependency instead of only a copied `web/vendor/voidware` snapshot.
- The app-specific CSS has grown around older milestones and should be rebuilt as a coherent product surface, not patched selector-by-selector.
- The approval flow and wizard polish should be validated inside the rebuilt shell because those surfaces depend on the same modal, settings, drawer, form, and short-height layout rules.
- Milestone 10 is a product migration: package source of truth, CSS architecture, dense dashboard polish, settings/wizard composition, auth approval UX, and screenshot evidence all land together.

---

## Current Baseline

- `package.json` now pins `@shxdowcollective/voidware` to `1.0.1`.
- `package-lock.json` records the GitHub Packages tarball and peer graph.
- The app remains zero-build at runtime: FastAPI serves static `web/` assets, sql.js runs in-browser, and the launcher does not require bundling.
- `web/index.html` imports `vendor/voidware/index.css` and `web/style.css`.
- `web/vendor/voidware/` still reports `0.9.10` in `VERSION.md`; its CSS currently matches the installed package `src/css/` except for `VERSION.md` and the package-only `theme-template.css`.
- `scripts/voidware_app_broker.mjs` still resolves the CLI service from a local Voidware source checkout or `VOIDWARE_CLI_SERVICE_MODULE`.

---

## Voidware 1.0.1 Features To Incorporate

### Package Source Of Truth

- Treat `node_modules/@shxdowcollective/voidware/src/css` as the imported upstream CSS source.
- Keep `web/vendor/voidware` as the committed static runtime copy unless the server explicitly mounts package CSS.
- Add a small repeatable vendor refresh script instead of hand-copying CSS.
- Update `web/vendor/voidware/VERSION.md` to `1.0.1`, package tarball provenance, copy command, and copied timestamp during implementation.

### CSS Exports

- Preserve the package import order:
  `variables`, `base`, `typography`, `background`, `animations`, `buttons`,
  `inputs`, `cards`, `toggles`, `popovers`, `modals`, `toasts`, `wizard`,
  `avatars`, `status-chips`, `layout`, `responsive`.
- Keep app CSS strictly consumer-owned. No redefining package `.vw-*` classes except documented local composition around them.
- Prefer package primitives where they fit:
  `vw-page-accent-panel`, `vw-feature-empty-state`, `vw-summary-chip-row`,
  `vw-display-row`, `vw-settings-group`, `vw-path-row`, `vw-dirty-badge`,
  `vw-provenance-badge`, `vw-scroll-shadow`, `vw-mobile-cta-bar`, and
  `data-vw-open="true"` drawer state.

### Runtime APIs

- Evaluate replacing local source-tree-only assumptions with package imports where the root package is enough:
  `@shxdowcollective/voidware/auth`, `auth-templates`, `config`, `paths`,
  `logging`, and `types`.
- Use `createLogger` in Node production paths instead of raw console output when the app bridge gains durable JS-side logging.
- Use `auth-templates` for provider, Exa, and LLM Stats secret save payloads so metadata stays consistent and secret material never leaks into config.
- Move selected saved credentials toward serialized `AuthCredentialRef` identity so duplicate names across keyring, user-file, repo-file, env, and portable sources are not collapsed accidentally.
- Keep the app-owned approval bridge if the CLI service remains the only exported approval broker host, but document the package/CLI boundary plainly.

---

## CSS Rebuild Strategy

`web/style.css` should be rebuilt from the ground up with a sectioned app layer. The target is not "make the old CSS pass"; it is a fresh Voidware 1.0.1 product shell that preserves existing behavior.

### New App CSS Topology

1. **App tokens and page accent**
   - LLM-Dash page accent variables, vendor/entity colors, score/tier colors, chart colors.
   - No duplicate Voidware token definitions.
   - Entity colors remain identity-bound; UI states theme through `var(--vw-*)`.

2. **Shell and navigation**
   - Desktop sidebar, tablet icon rail, mobile drawer, backdrop, mobile header.
   - Use package drawer convention: `.open` or `data-vw-open="true"` on sidebar/backdrop.
   - Navigation remains semantic, readable, and never clipped to fragments.

3. **Page headers and subpage rhythm**
   - Compact page title row, one short support line, local primary action when needed.
   - Subpage nav that reads as navigation, not decorative chips.
   - Remove oversized hero-like treatment from product views.

4. **Dashboard work surfaces**
   - Models table, chart view, model detail panel, compare links, filters, sparklines, report export.
   - Useful data before bulky filters.
   - Bounded dense panels with sticky headers, bottom padding, scroll shadows, and horizontal overflow cues.
   - Phone tables become labeled cards or priority rows unless comparison requires horizontal scroll.

5. **Stats and analytics**
   - Metrics must guide decisions and update with filters or label themselves as global.
   - Charts, leaderboards, empty states, loading states, and filtered-empty states use product copy.
   - No raw zero theater or debug-like metadata on first paint.

6. **Changelog reader**
   - Date list, Markdown body, compare tab, diff tables, search, empty/loading/error states.
   - Reader surfaces stay calm and bounded; long Markdown scroll is intentional and reachable.

7. **Settings**
   - Provider, Models, Research, and Schedule as category pages.
   - Use `vw-settings-group`, display/path rows, provenance/dirty badges, scoped save/revert affordances, and a separated destructive area where needed.
   - Keep credential autosave forbidden; saves remain explicit.
   - Replace internal access wording with user-facing service/access language.

8. **Wizard**
   - Step-specific H1s, readable stepper labels, clear Skip/Next hierarchy.
   - Rebuild Connection as a task surface:
     saved-key selection, provider summary, access refresh, endpoints, and connection test should not read as one long stacked form.
   - Manual-key and saved-key branches must feel distinct.
   - Advanced details are bounded, not page-length form dumps.
   - Short-height footer stays reachable at `1280x640`.

9. **Overlays and transient UI**
   - Manual refresh modal, update progress overlay, Voidware approval modal, toasts, keyboard help.
   - Modal focus, countdown, retry, denial, expiration, loading, and chained approval states are part of the CSS QA matrix.

10. **Responsive contracts**
    - Desktop `1280x800`, tablet `768x600`, short desktop `1280x640`, and mobile drawer states.
    - One scroll model per view unless a dense bounded panel intentionally owns scroll.
    - No skinny portrait text panels; cards stack full-width or become rows/lists.

---

## Implementation Phases

### Phase 10.1 — Package Foundation

- Keep `@shxdowcollective/voidware@1.0.1` pinned exactly in `package.json`.
- Add `node_modules/` to `.gitignore`.
- Add a documented `npm ci` developer step for package refresh work.
- Add a small script such as `scripts/vendor_voidware_css.py` or `scripts/vendor_voidware_css.mjs` that:
  - copies `node_modules/@shxdowcollective/voidware/src/css/*.css` into `web/vendor/voidware/`;
  - excludes `theme-template.css`;
  - updates `web/vendor/voidware/VERSION.md`;
  - verifies the import chain after copy.
- Run the vendor script once and commit the refreshed 1.0.1 provenance.

### Phase 10.2 — Runtime Integration Audit

- Map every current Voidware touchpoint:
  `scripts/voidware_auth.py`, `scripts/voidware_app_broker.mjs`, `scripts/config.py`, `/api/voidware/*`, wizard approval functions, Settings access UI.
- Decide which calls can use root package exports now and which still require `@shxdowcollective/voidware-cli` or local CLI service builds.
- Replace local-version error text like "Rebuild Voidware 0.9.10" with 1.0.1/package-aware guidance.
- Add package smoke checks:
  - import `@shxdowcollective/voidware/auth`;
  - import `@shxdowcollective/voidware/auth-templates`;
  - import `@shxdowcollective/voidware/logging`;
  - confirm CSS source files exist.

### Phase 10.3 — CSS Inventory And Cutover Prep

- Produce a surface inventory matrix before editing UI CSS:
  Models table, Models chart, selected model detail, filters open, filtered empty, Changelog reader, Changelog compare, Stats overview, Stats filtered, Settings Provider, Settings Models, Settings Research, Settings Schedule, Manual Refresh, update progress, wizard steps 0-6, approval modal states, mobile drawer, tablet rail, loading/bootstrap, error states.
- Freeze old `web/style.css` as reference only.
- Build the new sectioned stylesheet in-place, deleting stale selector clusters as each surface is rebuilt.
- Keep JavaScript behavior changes scoped to class/state hooks needed for the new CSS.

### Phase 10.4 — Dashboard And Dense Surfaces

- Rebuild app shell, page headers, subpage nav, and model dashboard first.
- Move filters behind compact affordances where they dominate first paint.
- Apply `vw-scroll-shadow` and horizontal scroll cues to dense tables.
- Rework model cards/details for portrait/mobile without clipping or skinny text tiles.
- Verify chart panels have styled empty/loading states and useful legends near marks.

### Phase 10.5 — Settings, Credentials, And Approval UX

- Rebuild Settings around category groups and display rows.
- Align source/value rows with Voidware 1.0.1 ref/source language without exposing raw internal enums.
- Keep explicit save/renew/revoke flows.
- Ensure access-conflict recovery remains clear: stop background access or reopen Voidware Manager, then retry.
- Validate approval modal states:
  pending, password required, secret required, submitting, retry, denied, expired, chained approval, and success.

### Phase 10.6 — Wizard Rebuild

- Rebuild first-run/fullscreen wizard against the current wizard template.
- Connection step becomes the anchor surface:
  saved credential branch, manual key branch, provider preset summary, endpoint controls, connection test, and Voidware approval all fit without a form wall.
- Schedule and summary steps show timezone/next-run and plain-language review rows.
- Loading, boot spinner, success, and error states use stable geometry.

### Phase 10.7 — Copy And Accessibility Pass

- Replace raw/internal labels:
  "broker", source enum dumps, booleans, storage paths, and low-level grant wording.
- Ensure buttons are buttons and navigation is anchors/route controls with `aria-current`.
- Keep icon-only controls named.
- Preserve focus after filters, row selection, modal close, approval retry, wizard navigation, and drawer close.
- Use `Intl.*` for displayed dates, times, percentages, and currency where not already covered.

### Phase 10.8 — Verification And Evidence

- Static checks:
  - `npm ci`
  - package import smoke script
  - `node --check web/app.js scripts/voidware_app_broker.mjs`
  - `python3 -m py_compile server.py scripts/*.py tests/*.py`
  - `python3 -m unittest discover -v`
  - `git diff --check`
- Browser checks with one headed `agent-browser` session:
  - `1280x800`
  - `768x600`
  - `1280x640`
  - phone/mobile drawer
  - scrolled/below-fold evidence for settings, wizard, dense panels, and drawer states.
- Capture before/after screenshots for each P0/P1 visual fix.
- Do not mark Milestone 10 done until every row in the surface matrix is passed or explicitly deferred with a reason.

---

## Acceptance Criteria

- LLM-Dash depends on `@shxdowcollective/voidware@1.0.1` through committed `package.json` and `package-lock.json`.
- Vendored CSS provenance says 1.0.1 and is refreshable from the package.
- `web/style.css` is reorganized into a fresh app layer with no stale 0.9.x polish clusters.
- App screens use Voidware 1.0.1 primitives where appropriate instead of duplicating equivalent local patterns.
- The old Phase 9.7 follow-up and CSS Fix Milestone are removed from `TODO.md`.
- Settings and wizard copy avoid internal broker jargon on first paint.
- Credential behavior remains secret-safe:
  no secrets in config, logs, responses, screenshots, docs, or commits.
- Required verification commands pass.
- Screenshot evidence covers all required viewports and interaction states.
- `LOGBOOK.md` records implementation and verification notes.

---

## Known Risks

- The root `@shxdowcollective/voidware` package does not appear to export the CLI service used by the current app-owned approval bridge. Milestone 10 should not break the approval path trying to force that migration; keep the bridge working and document the package/CLI split.
- Rebuilding CSS in-place can create regressions if old selectors are deleted before their matching JS states are mapped. Work surface-by-surface and verify after each major group.
- Browser screenshots may expose credential-related UI. Use fake/disposable values and isolated `LLM_DASH_SHXDOW_ROOT` roots.
- The package README badge says 1.0.0 while the package version is 1.0.1. Trust `package.json`, lockfile, and the skill spec for this migration.

