# LLM-Dash — Agent Guide

Universal instructions for AI coding agents working on this repository.
Applies to Claude Code, Codex, Gemini CLI, Cline, Continue, Cursor, and other
agent runtimes.

## First: Identify the Work Type

### Dashboard Update Runs

If you are running the daily/model benchmark update workflow, follow
[docs/update_dashboard.md](docs/update_dashboard.md). That document contains
the update-only triggers, metrics, append-only data rules, and the pointer to
the source-of-truth update procedure in [skill/SKILL.md](skill/SKILL.md).

Dashboard update runs are the only work type where the static frontend is
read-only.

### Development Work

If you are doing feature work, bug fixes, docs, refactors, UI work, tests, or
release prep, use the development instructions below.

## Development Entrypoints

| What you need | Where to look |
|---|---|
| Quick start & project overview | [README.md](README.md) |
| System architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development & code conventions | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Active roadmap | [TODO.md](TODO.md) |
| Handoff history | [LOGBOOK.md](LOGBOOK.md) |
| Implementation history | [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md) |
| Dashboard update workflow | [docs/update_dashboard.md](docs/update_dashboard.md) |

## Development Rules

- Prefer the existing architecture: FastAPI server, vanilla HTML/CSS/JS
  frontend, sql.js in-browser queries, SQLite data layer, and committed vendor
  assets.
- Keep feature and UI work scoped to the active task. Do not turn a dashboard
  update run into product development, and do not turn product development into
  benchmark/data mutation.
- For frontend work, `web/` is editable. Verify UI changes with browser
  screenshots/probes when layout, responsiveness, or interaction behavior
  changes.
- Do not modify old `changelogs/*.md` files unless the user explicitly asks for
  audit-log repair. Changelog history is append-only by default; Settings → Reset
  with typed confirmation is the deliberate operator exception, and normal update
  runs remain append-only.
- Do not rewrite old `model_scores` history unless the task is explicitly a
  data repair/migration and the plan documents why.
- Keep credential material out of logs, screenshots, browser responses,
  changelogs, docs, and committed files.
- Update `TODO.md`, `LOGBOOK.md`, and relevant docs when development work
  changes behavior, workflow, architecture, or user-facing expectations.
- Run the smallest meaningful verification for the change. If verification
  cannot run, record the exact blocker and the command that should be run.
