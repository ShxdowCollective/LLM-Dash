# Provider logos

SVG provider icons vendored from [models.dev](https://models.dev) on 2026-06-07
(`https://models.dev/logos/<slug>.svg`). Bundled locally so the static dashboard
renders them offline with no third-party network calls.

The vendor string → file map lives in `web/app.js` (`VENDOR_LOGO`). Slugs that
models.dev has no dedicated logo for return a generic fallback SVG; those are
omitted here and the affected vendors fall back to a colored monogram rendered
in-app.

To refresh: re-fetch each `<slug>.svg`, confirm the bytes differ from the generic
fallback (`z-ai`, `meta`, `qwen` collided with it on 2026-06-07), and update the
map. models.dev content is community-maintained; see its repo for licensing.
