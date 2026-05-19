# Dashboard Mobile/Nav Refresh Plan

Date: 2026-05-18

## Goal

Tighten the Models dashboard navigation/copy, remove the desktop-only clutter
called out by review, and rebuild the portrait dashboard layout so a
1080x1920 viewport gets a native card list instead of a squeezed comparison
table.

## Scope

- `web/index.html`: sidebar brand and section copy.
- `web/app.js`: Models header text, Changelog tab rendering, Models table
  columns, sort options, Settings Models markup, and mobile model card output.
- `web/style.css`: colored picker outlines, table widths, Settings Models
  layout, and portrait/mobile dashboard CSS.
- `TODO.md` and `LOGBOOK.md`: record the UI behavior change and verification.

## Steps

1. Remove the visible Changelog Compare tab and always show the selected entry.
2. Remove the Trend column and Trend sort control from the main Models table.
3. Update nav/page copy to make the shell brand `LLM-Dash`, the Models page
   kicker `Models`, and the page title `Dashboard`.
4. Add stronger color treatment to the Table/Chart picker and sort group.
5. Rework Settings > Models into a compact centered form layout.
6. Add a portrait/mobile Dashboard model-card list and hide the wide table in
   tall/narrow viewports.
7. Verify syntax, tests, browser layout, and docs/logbook sync.

## Risks

- Changelog compare helpers may remain unused; the visible route should no
  longer expose them.
- Portrait media queries must not accidentally degrade normal 1920x1080
  desktop layout.
