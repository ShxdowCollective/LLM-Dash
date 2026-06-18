# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org).

Note: the dated files under `changelogs/` are **product data** — the
AI-generated daily LLM benchmark updates shown in the dashboard. This file
tracks changes to the **application** itself.

## [Unreleased]

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

[Unreleased]: https://github.com/phxntomkid/LLM-Dash/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/phxntomkid/LLM-Dash/releases/tag/v1.0.0
