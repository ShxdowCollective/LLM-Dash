# LLM-Dash — Development Guide

> Contributor and developer reference. For system architecture, see
> [ARCHITECTURE.md](ARCHITECTURE.md). For the user-facing overview, see the
> [README](../README.md).

---

## Prerequisites

- **Python 3.10+** — the server and all scripts target 3.10 minimum
- **Git** — for version control and logbook workflow
- **Node 20+ / npm 10+** — required for the Voidware package import and the
  app-owned approval bridge when using saved Voidware credentials
- A modern browser (Chrome, Firefox, Edge, Safari) for the dashboard

Optional:
- An OpenAI-compatible API key for testing Agent Provider updates
- An Exa API key for testing research-driven updates

---

## Local Setup

```bash
git clone <repo-url> && cd LLM-Dash

# Install the local command and Python deps
./install.sh                  # or .\install.bat on Windows

# Launch the dashboard
llm-dash start
```

The installer creates `.venv`, installs Python requirements, installs the local
package entry point, and writes a managed `llm-dash` command shim. If the shim
directory is not on `PATH`, either open a new terminal after fixing `PATH` or run
`./llm-dash start` / `.\llm-dash.cmd start` from the repo.

For Voidware package refresh/migration work only:

```bash
# @shxdowcollective/voidware + voidware-cli resolve from GitHub Packages, so
# export a token first. .npmrc reads ${GH_PACKAGES_KEY} from the environment
# (keep it in the gitignored .env; see .env.example).
set -a; . ./.env; set +a
npm ci
```

There is **no auto-seed**: an empty install boots into the setup wizard
(`needs_setup`) and you
seed the catalog from the **Catalog** step via the research agent
(`scripts/seed_catalog.py`). To preseed offline without the wizard, run
`python scripts/init_db.py` (the 34-model bootstrap escape hatch).

To return a local install to first-run state, use `llm-dash reset` or
`llm-dash start --reset`. Use `llm-dash reset --dry-run` to preview what would
be removed.

| Category | What's removed |
|---|---|
| Provider config | `~/.shxdow/config/shxdow.llmdash.json` |
| Scheduled job | OS-level timer/task + state file |
| Database | `data/dash.sqlite` + WAL/SHM/journal sidecars |
| Metrics CSV | `data/run_metrics.csv` |
| Run logs | `logs/run-update-*.log`, `logs/server.log`, `logs/scheduled-run.log` |
| Broker grants | LLM-Dash's own Voidware broker grants/access tokens (revoked via the local CLI when the broker is reachable; skipped with a warning otherwise) and the legacy `llm-dash-voidware-grants` keyring cache |
| UI state | `localStorage` (cleared via `?setup=1` / `?reset=1` on next load) |

After a CLI reset-start the app opens guided setup mode (`?setup=1`): a step
rail over the Settings pages (Connection, Models, Research, Schedule, Finish).
In-app full reset (Settings → Reset) lands in the same mode.

**Not removed:** `changelogs/*.md` (append-only audit history; Settings → Reset
with typed confirmation is the deliberate operator exception),
Voidware credentials and auth files, reusable provider credentials,
keyring/keystore secrets, `web/` static assets, Python virtual environment.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `LLM_DASH_HOST` | `127.0.0.1` | Server bind address |
| `LLM_DASH_PORT` | `8787` | Server port |
| `LLM_DASH_LOG_PATH` | `./logs/server.log` | Override background server log path |
| `LLM_DASH_NO_BROWSER` | — | Disable browser launch for foreground starts |
| `LLM_DASH_BASE_URL` | — | OpenAI-compatible provider base URL (also accepts `BASE_URL`). Must not end in `/v1` unless `LLM_DASH_ENDPOINT_MODE=root` |
| `LLM_DASH_API_KEY` | — | Provider API key; takes precedence over broker/legacy stores (also accepts `LLM_DASH_PROVIDER_API_KEY`/`API_KEY`) |
| `LLM_DASH_DEFAULT_MODEL` | — | Default model the agent uses for seeding + updates (also accepts `DEFAULT_MODEL`) |
| `LLM_DASH_BACKUP_MODEL` | — | Optional fallback model (also accepts `BACKUP_MODEL`) |
| `LLM_DASH_ENDPOINT_MODE` | `append_v1` | `append_v1` (append `/v1`) or `root` (use base URL as-is, e.g. when it already ends in `/v1`) |
| `LLM_DASH_SHXDOW_ROOT` | `~/.shxdow` | Isolated config/auth root for tests |
| `LLM_DASH_DATA_DIR` | `./data` | Override the data dir (DB + metrics CSV); used by the e2e harness for an isolated, throwaway database |
| `LLM_DASH_CHANGELOGS_DIR` | `./changelogs` | Override the changelogs dir; used by the e2e harness so tests never write real, append-only history |
| `EXA_API_KEY` | — | Exa search API key (Exa seed preset + update enrichment) |
| `ARTIFICIAL_ANALYSIS_API_KEY` | — | Artificial Analysis Data API key (AA seed preset; also accepts `AA_API_KEY`) |
| `LLM_STATS_API_KEY` | — | LLM Stats API key (LLM Stats seed preset + update enrichment) |
| `LLM_DASH_LLMSTATS_API_KEY` | — | Alternate LLM-Dash-specific LLM Stats key |

Provider env vars are read-only overrides that take precedence over wizard/broker
config. Names above match what `scripts/config.py` reads; the canonical
`LLM_DASH_*` forms are preferred but the bare aliases (`BASE_URL`,
`DEFAULT_MODEL`, `AA_API_KEY`, …) also work.

---

## Project Structure

### Backend (`server.py` + `scripts/`)

| File | Responsibility |
|---|---|
| `server.py` | FastAPI app: static mounts, API routes, bootstrap, job management |
| `scripts/config.py` | Provider config + credential pipeline (env → selected Voidware provider → Voidware broker; legacy keyring reads are migration-only) |
| `scripts/voidware_auth.py` | Python controller for Voidware provider discovery, app-owned approval bridge lifecycle, and broker-backed provider/Exa/LLM Stats API keys |
| `scripts/voidware_app_broker.mjs` | Node worker that imports Voidware 1.1.0 package/CLI service APIs (cli resolved from `node_modules`) and hosts LLM-Dash-owned approval prompts |
| `scripts/vendor_voidware_css.mjs` | Copies `@shxdowcollective/voidware` CSS into `web/vendor/voidware/` and refreshes provenance |
| `scripts/voidware_package_smoke.mjs` | Verifies package CSS sources and runtime exports (`auth`, `auth-templates`, `logging`) |
| `scripts/init_db.py` | Offline CLI preseed escape hatch (34-model bootstrap) + shared `ensure_schema()`; not auto-run on launch |
| `scripts/seed_catalog.py` | Wizard-driven catalog seeder: prefetch candidates (AA/LLM Stats/OpenRouter/custom) → batch-score via the research harness with missing-candidate recovery/count guards → single `apply_update` (`POST /api/seed`) |
| `scripts/run_update.py` | Agent Provider update executor (OpenAI Agents SDK) |
| `scripts/export_metrics_csv.py` | Regenerates `data/run_metrics.csv` from SQLite |
| `scripts/schedule_job.py` | OS-level scheduled job installer/remover |
| `scripts/launch_server.py` | Backward-compatible wrapper around `llm_dash.process.start_background()` |
| `scripts/build_release.py` | Builds curated GitHub release zip/tar assets and checksums |
| `scripts/publish_release.py` | Builds, tags, and publishes a GitHub release via `gh` (notes from CHANGELOG) |
| `scripts/schema.sql` | DDL source of truth for `data/dash.sqlite` |
| `scripts/migrate_score_checks.py` | Idempotent migration that adds 0–10 CHECK constraints to `model_scores` and bumps `meta.schema_version` to 2 |
| `scripts/migrate_model_metadata_v4.py` | Idempotent migration that adds `models.input_capabilities` and `models.deprecated_on` and bumps `meta.schema_version` to 4 |

### CLI package (`llm_dash/`)

| File | Responsibility |
|---|---|
| `llm_dash/cli.py` | `llm-dash` command parser (`install`, `start`, `stop`, `status`, `reset`, `doctor`, `open`, `version`) |
| `llm_dash/install.py` | Idempotent venv/package install and PATH shim writer |
| `llm_dash/process.py` | Cross-platform foreground/background uvicorn lifecycle, status, and stop |
| `llm_dash/paths.py` | Repo, venv, state, and log path resolution |

### Installers

| File | Responsibility |
|---|---|
| `install.sh` | macOS/Linux installer wrapper |
| `install.ps1` | Windows PowerShell installer |
| `install.bat` | Windows batch wrapper, including WSL UNC delegation |
| `llm-dash` / `llm-dash.cmd` | Repo-local command shims before PATH refresh |

### Frontend (`web/`)

| File | Responsibility |
|---|---|
| `web/index.html` | App shell, font imports, mount points |
| `web/style.css` | App-specific Voidware 1.1.0 app layer and component styles |
| `web/app.js` | sql.js bootstrap, route state, area renderers, Settings workflows, overlays |
| `web/provider-presets.json` | Static catalog of provider presets kept for API compatibility |
| `web/vendor/` | Vendored libraries (sql-wasm, marked.js, uPlot) — committed, not installed |

### Data

| Path | Contents |
|---|---|
| `data/dash.sqlite` | Source of truth. Created on first launch. Not committed. |
| `data/run_metrics.csv` | Human-readable mirror of `run_metrics` table |
| `changelogs/*.md` | Append-only daily changelog files |

### Documentation

| Path | Audience |
|---|---|
| `README.md` | Users |
| `docs/USAGE.md` | Users (detailed usage) |
| `CLAUDE.md` | Claude agent |
| `AGENTS.md` | Any AI agent |
| `skill/SKILL.md` | Any AI agent (update contract) |
| `docs/ARCHITECTURE.md` | Developers |
| `docs/DEVELOPMENT.md` | Contributors (this file) |
| `docs/scheduling.md` | Scheduling reference |
| `TODO.md` | Task board |

---

## Code Conventions

### Python

- Target Python 3.10+ syntax (match statements OK, `X | Y` union types OK)
- Use `from __future__ import annotations` for deferred type evaluation
- Type hints on all function signatures
- FastAPI endpoints use Pydantic models for request bodies
- SQLite access uses raw `sqlite3` — no ORM
- Credentials never appear in logs, API responses, or non-credential files

### JavaScript

- Vanilla JS only — no framework, no build step, no module bundler
- Single `web/app.js` file for all application logic
- Global `state` object, mutation triggers `render()`
- sql.js for all database queries (parameterized, never string-interpolated)
- Vendor libraries committed under `web/vendor/`

### CSS

- Voidware v1.1.0 is pinned in `package.json` (`@shxdowcollective/voidware`
  for auth/CSS, `@shxdowcollective/voidware-cli` for the broker service + bin);
  committed runtime CSS is still vendored under `web/vendor/voidware/` for the
  zero-build launcher contract. Refresh it from the installed package with:

  ```bash
  set -a; . ./.env; set +a   # token for GitHub Packages
  npm ci
  npm run vendor:voidware
  ```

  Keep provenance current in `web/vendor/voidware/VERSION.md`. The refresh
  script now vendors all package CSS including `theme-template.css` and verifies
  the `index.css` import chain after copy. Run `npm run smoke:voidware` to
  confirm package CSS sources, runtime exports, and that the cli service
  resolves from `node_modules`, or `npm run verify:voidware` for refresh + smoke
  together.
- Shadow-as-border: `box-shadow: 0 0 0 1px var(--vw-border)` instead of `border`
- Focus: `outline` with `outline-offset`, not box-shadow
- Typography: `--vw-font-body` (Inter) for prose, `--vw-font-mono`
  (JetBrains Mono) for code and scores
- No `!important` unless overriding vendor styles

### General

- No comments unless the *why* is non-obvious
- No dead code — delete it, don't comment it out
- Changelog files are append-only and must never be modified after creation
  (Settings → Reset with typed confirmation is the deliberate operator exception;
  normal update runs remain append-only)
- All SQL writes use transactions (`BEGIN` / `COMMIT`)

---

## Database Operations

### Schema Changes

1. Update `scripts/schema.sql` with the new DDL.
2. If existing DBs need migration, ship a focused migration module under
   `scripts/`. Use `scripts/migrate_score_checks.py` or
   `scripts/migrate_model_metadata_v4.py` as references: each validates or
   alters existing rows, rebuilds affected tables/views inside a single
   transaction, and bumps `meta.schema_version`.
3. Wire the migration into both `server.py` startup and the top of
   `scripts/run_update.py` so fresh-install and update-run paths converge.
4. Bump `meta.schema_version` (the current target is `4`).
5. Test with both fresh DB creation and migration from the previous version.

### Querying from the Browser

The frontend uses sql.js (SQLite compiled to WASM). Queries run entirely
client-side after the initial `dash.sqlite` fetch. All queries are
parameterized:

```js
const { sql, params } = buildQuery(state.filter, state.sortBy);
const rows = db.exec(sql, params);
```

### Querying from Python

Scripts use the standard `sqlite3` module with `?` placeholders:

```python
con = sqlite3.connect("data/dash.sqlite")
con.execute("INSERT INTO ... VALUES (?, ?, ?)", (a, b, c))
con.commit()
```

---

## Adding a New API Route

1. Add the route in `server.py` following existing patterns
2. Use Pydantic `BaseModel` for request bodies
3. Return plain dicts (FastAPI serializes to JSON)
4. Errors: raise `HTTPException` with appropriate status codes
5. Never expose credentials in responses

---

## Adding a New Frontend View

1. Add a nav entry in `web/index.html` (or dynamically in `app.js`)
2. Add a `render{ViewName}()` function in `app.js`
3. Wire it into the `render()` dispatcher's view switch
4. Add any new state fields to the global `state` object
5. Style with Voidware tokens in `web/style.css`

---

## The Update Contract

`skill/SKILL.md` is the single source of truth for how updates work. Any AI
agent — Claude, Codex, Gemini, or another — reads it and follows the steps.

If you need to change the update procedure:
1. Edit `skill/SKILL.md`
2. Update `CLAUDE.md` and `AGENTS.md` if the pointers changed
3. Test with at least one agent end-to-end

Do **not** create parallel update scripts that bypass SKILL.md.

---

## Changelog Format

Every update writes `changelogs/YYYY-MM-DD.md` with this structure:

```markdown
---
date: 2026-04-20
generated_at: 2026-04-20T09:02:14Z
agent: claude-opus-4-7
agent_runtime: claude-code
new_models: ["Model A", "Model B"]
changes:
  - { model: "Model C", field: "intelligence", from: 9.4, to: 9.3 }
---

# Changelog — April 20, 2026

## New Models
...

## Score Changes
...

---

## Run Metadata

| metric | value |
|---|---|
| agent | claude-opus-4-7 |
| ... | ... |
```

The `## Run Metadata` footer is **required**. The Stats page joins
`run_metrics` to changelog content; a missing footer reads as a broken run.

---

## Provider Presets

`web/provider-presets.json` remains the static catalog served by
`/api/provider-presets`. To add or update a preset:

1. Edit `web/provider-presets.json`
2. Follow the existing shape: `name`, `base_url`, `endpoint_mode`, `docs_url`,
   `model_examples`, and optional `models_override_url`
3. Test the provider API and Settings connection flow with the new preset data

---

## Scheduling Internals

`scripts/schedule_job.py` detects the platform and installs a native job:

| Platform | Method | Notes |
|---|---|---|
| Linux / WSL (with systemd) | `systemctl --user` timer | Checks `systemctl --user is-system-running` |
| macOS | `launchctl` plist | Written to `~/Library/LaunchAgents/` |
| Windows | `schtasks /create /xml` | Task Scheduler XML |

The API exposes `GET` / `POST` / `DELETE /api/schedule`. "Off" cadence removes
the job. All jobs invoke `scripts/run_update.py`.

---

## Testing

Run the default Python suite from the repo root:

```bash
python3 -m unittest discover -v
```

For syntax-level validation across the no-build frontend/backend split:

```bash
python3 -m py_compile server.py scripts/*.py tests/*.py
node --check web/app.js
```

### End-to-end (browser) tests

A headed, screenshot-driven Playwright harness covers every dashboard surface
(functional + visual regression + accessibility) against a hermetic,
`init_db`-seeded server that never touches real `data/` or `changelogs/`. See
[../e2e/README.md](../e2e/README.md) for the full guide.

```bash
set -a; . ./.env; set +a   # GH token for scoped npm deps
npm ci
npx playwright install chromium

npm run e2e            # full suite (functional + a11y + visual)
npm run e2e:update     # regenerate committed visual baselines
npm run audit          # autonomous loop — detect + classify + report (safe default)
npm run audit:fix      # full autonomous: self-heal helper + commit on green
```

Verification is local-first. Prefer documenting commands that an agent or
maintainer can run directly instead of designing release/test/publish flows that
depend on GitHub Actions. The deterministic E2E suite and token-spending audit
loop are local/triggered commands. Two env overrides added for isolation —
`LLM_DASH_DATA_DIR` and `LLM_DASH_CHANGELOGS_DIR` — point the server and
`init_db.py` at a throwaway directory.

---

## Common Tasks

### Reset the database

```bash
rm data/dash.sqlite
llm-dash start   # boots into the setup wizard (no auto-seed); seed from the Catalog step
# or preseed offline without the wizard:
python scripts/init_db.py
```

### Regenerate the metrics CSV

```bash
python scripts/export_metrics_csv.py
```

### Build release archives

```bash
.venv/bin/python scripts/build_release.py --version v1.0.0
cat dist/SHA256SUMS.txt
```

The builder creates curated `.zip` and `.tar.gz` assets under `dist/`, excludes
local state (`.env`, `.venv`, `.llm-dash`, generated DBs, logs, internal plans),
and includes the installers plus `llm-dash` command shims.

### Publish a GitHub release

`publish_release.py` wraps the last mile: it builds the assets (above), creates
and pushes an annotated tag at `HEAD`, then runs `gh release create` with the
assets and release notes lifted from the matching `## [X.Y.Z]` section of
`CHANGELOG.md`. Requires the [`gh`](https://cli.github.com) CLI, authenticated
(`gh auth login`). No GitHub Actions — this is a deliberate local command.

```bash
# Preview everything without touching git or GitHub:
.venv/bin/python scripts/publish_release.py --version v1.0.0 --dry-run

# Cut the release:
.venv/bin/python scripts/publish_release.py --version v1.0.0
```

Useful flags: `--draft` (don't push the tag; create a draft to review first),
`--prerelease` (auto-enabled for tags with a `-suffix` like `v1.1.0-rc1`),
`--no-build` (reuse existing `dist/` assets), `--skip-tag` (tag already pushed),
and `--allow-dirty`. The working tree must be clean unless `--allow-dirty`.

### Test the Agent Provider connection

```bash
curl http://127.0.0.1:8787/api/provider/test-connection
```

### Check scheduled job status

```bash
curl http://127.0.0.1:8787/api/schedule
```

### Run an update manually via the Agents SDK

```bash
python scripts/run_update.py --log-path logs/manual-test.log
```
