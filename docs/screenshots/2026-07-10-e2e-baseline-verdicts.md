# E2E visual baseline verdicts — 2026-07-10

Capture root: `e2e/tests/__screenshots__/visual.spec.ts/`. All 28 images were
regenerated from the hermetic enriched seed with a frozen clock. Verdicts use
the Voidware Agent Gate Card and were made from the full-resolution images, not
only the contact sheets.

## Defects closed during adjudication

- Tablet Models views now give the work surface the full width and place the
  scorecard below it; the previous flex row squeezed both columns.
- Mobile Settings wraps all five full navigation labels into a 3+2 grid.
- Mobile Models wraps primary model identity instead of ellipsizing it as the
  only readable form.
- Mobile Stats uses a compact 2×2 KPI block so trend content enters the first
  viewport.
- Changelog accent text now passes axe without exclusions, and the synthetic
  score entry no longer renders a dangling dash.
- The deterministic freshness chip is rendered normally; the old magenta
  Playwright mask no longer pollutes evidence.

## Per-capture verdicts

| Capture | Verdict | Notes |
|---|---|---|
| `models-list-wide.png` | PASS | Full catalog, filters, compact rows, and persistent scorecard are balanced and unclipped. |
| `models-table-wide.png` | PASS | Dense comparison table remains scan-friendly; column controls and rail are legible. |
| `models-chart-wide.png` | PASS | Scatter, axes, frontier, legend, and scorecard have clear hierarchy. |
| `changelog-wide.png` | PASS | Date rail, structured run details, and article body read as one primary reader surface. |
| `stats-wide.png` | PASS | KPIs, three uPlot trends, and leaderboard form a compact analytics workbench. |
| `settings-wide.png` | PASS | One dominant settings panel, complete section labels, and obvious save action. |
| `wizard-wide.png` | PASS | Capped setup window remains centered, focused, and readable at ultrawide scale. |
| `models-list-desktop.png` | PASS | List and scorecard share the viewport without clipped identity or controls. |
| `models-table-desktop.png` | PASS | Table density, column presets, and score rail remain readable at 1440×900. |
| `models-chart-desktop.png` | PASS | Chart is landscape, labels are readable, and the rail stays secondary. |
| `changelog-desktop.png` | PASS | Reader hierarchy and run metadata are complete with no contrast exception. |
| `stats-desktop.png` | PASS | Trend panels and leaderboard fit without trapped or competing scroll. |
| `settings-desktop.png` | PASS | Form width, copy density, and action hierarchy are calm and usable. |
| `wizard-desktop.png` | PASS | Progress, fields, and footer actions fit without clipping. |
| `models-list-tablet.png` | PASS | Full-width rows remain readable; the scorecard follows below the fold. |
| `models-table-tablet.png` | PASS | Mobile-card table adaptation preserves labels, scores, and controls. |
| `models-chart-tablet.png` | PASS | Full-width chart is no longer squeezed; scorecard begins below it. |
| `changelog-tablet.png` | PASS | List and article stack cleanly with complete dates and run details. |
| `stats-tablet.png` | PASS | 2×2 KPI and analytics grids stay landscape and readable. |
| `settings-tablet.png` | PASS | Complete section navigation and primary actions remain visible. |
| `wizard-tablet.png` | PASS | Stepper and form retain full labels with comfortable touch targets. |
| `models-list-mobile.png` | PASS | Primary model names wrap in full; rows, scores, and filters remain scannable. |
| `models-table-mobile.png` | PASS | Table becomes labeled model cards with no body-level horizontal scroll. |
| `models-chart-mobile.png` | PASS | Landscape plot, full legend labels, and scorecard handoff remain usable. |
| `changelog-mobile.png` | PASS | Entries and active article stack with complete dates and readable metadata. |
| `stats-mobile.png` | PASS | Compact 2×2 KPIs expose the first trend in the initial viewport. |
| `settings-mobile.png` | PASS | All five full navigation labels are visible in a 3+2 grid; actions fit. |
| `wizard-mobile.png` | PASS | Step labels, fields, and footer controls fit without clipped copy. |

## Review routing

The first blind image pass correctly flagged the clipped model identity and
mobile Stats density. A post-fix Cursor image pass was terminated before a
verdict; the required retry reached OpenCode but its read-only sandbox rejected
`/tmp` image access. Final PASS verdicts therefore come from the main agent's
full-resolution review plus the green screenshot and interaction gates.
