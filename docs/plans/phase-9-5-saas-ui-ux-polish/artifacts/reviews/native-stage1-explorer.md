# Native Stage 1 Explorer Notes

Read-only helper: native explorer `p0rtal`.

## Relevant Files

- `web/index.html`: zero-build asset order, sidebar shell, placeholder nav
  letters, footer Refresh/help/freshness cluster.
- `web/app.js`: single global state, hash routing, brute-force renderer,
  dashboard/settings/wizard render paths.
- `web/style.css`: app-specific Voidware overrides, typography drift, local
  control systems, responsive shell.
- `server.py`: FastAPI serves `web/`, `/data`, and `/changelogs`.
- `docs/plans/2026-05-10-polished-saas-ui-ux-plan.md` and
  `docs/plans/e2e-analysis/master-issue-list.md`: source plan and issue list.

## Architecture Notes

- Frontend is vanilla HTML/CSS/JS with no package/build step.
- Routing is hash-based.
- Rendering replaces DOM nodes through helper `h()` and central `render()`.
- Main surfaces are Models table/chart, Changelog, Stats, Settings, and the
  setup wizard.

## Risks

- Shared `.view-btn`, `.sort-btn`, `.action-btn`, `.filter-chip`, `.vw-btn`,
  `.vw-label`, and status styles affect multiple surfaces at once.
- Wizard title is state-derived and should be fixed without touching save/skip
  behavior.
- Settings credential UI must remain metadata-only; no autosave secret behavior.
- Existing baseline screenshots are full-page and gitignored.

## Verification Guidance

- `node --check web/app.js`
- `git diff --check`
- Headed `agent-browser` screenshots at `1280x800`, `768x600`, and `1280x640`.
- Probe horizontal overflow, clipped text, visible focus, internal panel
  scrollbars, sidebar footer overlap, and wizard short-height containment.
