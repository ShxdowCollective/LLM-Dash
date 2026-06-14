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

## Cursor Cloud specific instructions

Environment-specific notes for agents running in the Cursor Cloud VM. The
startup update script already refreshes Python deps into `.venv`; you do not
need to reinstall them.

- **Run the server (dev):** `.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8787`.
 It is the only long-running service. Start it in a background/tmux session — it
 stays in the foreground. There is no separate frontend or database process:
 the frontend is zero-build static files and the SQLite DB runs in-browser via
 sql.js. `data/dash.sqlite` is gitignored and **no longer auto-seeds** on first
 launch: an empty install returns bootstrap state `needs_setup` and the frontend
 boots into the setup wizard, which seeds the catalog from a chosen source via
 the research agent (`scripts/seed_catalog.py` → `POST /api/seed`).
 `scripts/init_db.py` remains the offline CLI escape hatch to preseed the 34-model
 bootstrap set (`python scripts/init_db.py`).
- **Tests:** `.venv/bin/python -m pytest tests/` runs the full suite (75 tests).
 `tests/test_m13.py` requires `pytest` (installed by the update script, not in
 `requirements.txt`); plain `python -m unittest discover` skips/errors on it.
- **Lint/syntax (no linter configured):** `.venv/bin/python -m py_compile server.py scripts/*.py tests/*.py`
 and `node --check web/app.js`. There is no build step.
- **Voidware npm tooling is optional.** The runtime CSS is committed under
 `web/vendor/voidware/`, so the dashboard works without `npm`. The
 `@shxdowcollective/voidware` package lives on GitHub Packages and needs auth:
 a gitignored `.npmrc` pointing the `@shxdowcollective` scope at
 `npm.pkg.github.com` with `_authToken=${GH_PACKAGES_KEY}` is already present so
 `npm ci`, `npm run smoke:voidware`, and `npm run vendor:voidware` work. Never
 commit `.npmrc` (it holds a token).
- Update/agent runs (`scripts/run_update.py`, Refresh button) need external
 provider/Exa credentials and are not required to develop or view the dashboard.
