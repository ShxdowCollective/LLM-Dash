# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org).

Note: the dated files under `changelogs/` are **product data** — the
AI-generated daily LLM benchmark updates shown in the dashboard. This file
tracks changes to the **application** itself.

## [Unreleased]

## [1.2.2] - 2026-07-05

### Fixed

- Aligned deployed first-run seed/update/reset paths so env-overridden
  `LLM_DASH_DATA_DIR` and `LLM_DASH_CHANGELOGS_DIR` installs no longer split
  server reads from subprocess writes or reset cleanup.

## [1.2.1] - 2026-06-24

### Fixed

- Catalog seeding now fails fast instead of silently applying fewer models than
  requested: prefetched sources require enough unique candidates, scored batches
  retry once when prefetched models are omitted, discovery presets retry once
  when they return short, and final unique output must match the selected count.
- LLM Stats and other prefetched seed sources now de-dupe candidates before
  counting them; custom endpoint seeding also accepts top-level array `/models`
  responses.
- `llm-dash stop` no longer reports an unmanaged live server as running when no
  managed server state file exists.

## [1.2.0] - 2026-06-24

### Added

- Live, streaming job console for both seeding and refresh runs: the agent's
  research turn now narrates per-tool activity (search vs fetch) with a phase
  label, gradient progress bar, parsed timeline, and a 1s ticker so elapsed time
  and the progress bar animate between polls instead of going dark.
- Refresh-run phase markers (state loaded, diff, apply) with model counts on
  completion.

### Changed

- Unified the seed and refresh run experience behind shared job console and
  progress helpers; rebuilt the refresh run window to match the seed flow, with
  explicit success / failed / canceled states.
- Pointed repository URLs at the `ShxdowCollective/LLM-Dash` org location across
  the changelog, issue templates, CONTRIBUTING, and SUPPORT.

### Fixed

- Record real `exa_searches` / `exa_fetches` counts in the `run_metrics` row and
  the changelog Run Metadata footer (were hardcoded to 0), using a per-attempt
  accumulator that does not double-count on retry or Exa fallback.

## [1.1.0] - 2026-06-20

### Added

- Cancel a running update from the dashboard: new
  `POST /api/run-update/{job_id}/cancel` endpoint plus Refresh UI control, with
  job state tracking (`canceled` / `succeeded` / `failed`).
- `RunUpdatePayload` request model for `/api/run-update`, exposing per-run source
  parameters (preset, count, index, prompt, custom endpoint/credential).
- Additional model-source presets for refresh and catalog seeding: `openrouter`
  and `custom-endpoint` (bring-your-own `/models` API), alongside the existing
  `aa`, `llmstats`, `exa`, and `custom-prompt` sources.

### Changed

- Clearer setup and seeding experience in the wizard and Refresh flow, with
  improved progress and status feedback.
- More detailed seed and refresh logging for easier troubleshooting.
- Refreshed README and screenshots with a models leaderboard view and updated
  visuals.

## [1.0.0] - 2026-06-17

### Added

- Initial public release.
- Models leaderboard with five benchmark dimensions (intelligence, coding,
  agent capability, speed, cost), S–F tier grades, and per-vendor color coding.
- Interactive SVG scatter and radar comparison charts.
- Append-only daily changelog timeline rendered from Markdown.
- Stats page: token usage, cost, duration, and per-agent breakdowns across
  every update run.
- Settings-first setup wizard for BYOK provider, models, Exa research, optional
  LLM Stats enrichment, and OS-level scheduling.
- Agent-agnostic update contract (`skill/SKILL.md`) any AI agent can follow.
- Zero-build runtime: vanilla HTML/CSS/JS served by a FastAPI server, SQLite
  source of truth, sql.js in the browser.
- Cross-platform `llm-dash` CLI and installers (macOS/Linux/Windows) with
  foreground, silent/background, status, stop, and reset commands.

[Unreleased]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ShxdowCollective/LLM-Dash/releases/tag/v1.0.0
