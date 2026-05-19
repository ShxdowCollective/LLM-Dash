# Native Stage 1 Phase Planner Notes

Read-only helper: native planner `c0sm0s`.

## Recommended Order

1. Replace sidebar `M/L/S/C` glyphs with real icons while preserving visible
   labels and ARIA state.
2. Expand or reuse the local icon system where needed.
3. Split legacy control rules into dense desktop controls and preserved mobile
   touch targets.
4. Move wizard labels, titles, subtitles, and helper copy toward body/display
   fonts.
5. Move settings group headings and prose to body/display fonts while keeping
   code-like values mono.
6. Fix stale wizard H1 by deriving it from step state.

## Dependencies

- Stage 2 bounded panels should follow Stage 1 control-height stabilization.
- Stage 3 settings composition should preserve existing explicit-save semantics
  and avoid autosave secrets.

## Verification

- `node --check web/app.js`
- `git diff --check`
- Representative headed smoke for Models table, Settings Provider, and Wizard
  if broad CSS lands.

## Deferrals

- Final dense-control spacing, chart/list proportions, and short-height wizard
  containment require screenshots.
