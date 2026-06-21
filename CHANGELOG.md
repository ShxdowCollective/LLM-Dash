# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org).

Note: the dated files under `changelogs/` are **product data** — the
AI-generated daily LLM benchmark updates shown in the dashboard. This file
tracks changes to the **application** itself.

## [Unreleased]

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

[Unreleased]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/ShxdowCollective/LLM-Dash/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ShxdowCollective/LLM-Dash/releases/tag/v1.0.0
