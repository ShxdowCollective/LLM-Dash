# LLM-Dash

A no-build, click-to-launch local dashboard for tracking LLM benchmark snapshots and
daily model changelogs.

- Voidware-powered UI with append-only, searchable history.
- SQLite source of truth with browser-side SQL queries via `sql.js`.
- AI-driven updates written through the `skill/SKILL.md` contract.

## What this is

- **Static frontend.** One HTML/CSS/JS app served from a tiny FastAPI server.
  Run `./run.sh` (macOS/Linux) or `run.bat` (Windows) to open the dashboard.
- **Source of truth in SQLite.** `data/dash.sqlite` stores every model, score
  history, changelog index, and run metrics.
- **Changelogs on disk.** Every update creates
  `changelogs/YYYY-MM-DD.md` with required frontmatter and `## Run Metadata`
  footer.
- **Agent Provider update path.** Since Phase 6, the app can run updates through a
  BYOK-compatible provider endpoint through the OpenAI Agents SDK.
- **Legacy CLI fallback.** The old clipboard + terminal flow is still available as
  an explicit fallback when provider automation is not configured.
- **Read-only UI.** The frontend is currently for viewing and control; data is
  written only by update runs and seeded scripts.

## Quick start

### Requirements

- Python 3.10+
- Internet access for first-time dependency install and any scheduled model updates

### Launch

```bash
./run.sh          # macOS/Linux
run.bat           # Windows
```

Both launchers do the same thing:

1. Create/activate a local `.venv`.
2. Install dependencies from `requirements.txt`.
3. Start `uvicorn server:app` on `127.0.0.1:8787` (`LLM_DASH_PORT` overrides).
4. Open the dashboard in your default browser.

The server keeps running in the foreground; close the terminal to stop it.

## Desktop launch shortcuts

- **Windows:** right-click `run.bat` and create a shortcut, then pin it to your
  desktop.
- **macOS:** create an Automator app that runs
  `cd "$HOME/Repos/LLM-Dash" && ./run.sh`, then save and pin it.
- **Linux:** create a `.desktop` entry pointing `Exec=` at your absolute `run.sh`.

## Running an update manually (legacy path)

In the dashboard, click **Refresh** to get the generated prompt and open a local
terminal from the browser.

```bash
# macOS
claude "$(pbpaste)"
codex  "$(pbpaste)"

# Linux (requires xclip or wl-paste)
claude "$(xclip -selection clipboard -o)"

# Windows PowerShell
claude (Get-Clipboard)
codex  (Get-Clipboard)
```

Paste the generated prompt into your agent CLI, run it, then refresh the page when
the run is complete.

## Agent Provider backend (Phase 6+)

`POST /api/provider` stores runtime config (secret-safe):

- `base_url`, `api_key`, `endpoint_mode`
- optional `models_override_url`
- optional default/request headers
- default and backup model IDs

Credentials are written to OS keychain first, then `~/.shxdow/auth.json` as a
fallback. Public config is stored in `~/.shxdow/config/shxdow.llmdash.json`.

Helpful endpoints:

- `GET /api/provider`
- `GET /api/provider-presets`
- `POST /api/provider-test-connection`
- `POST /api/run-update`
- `GET /api/run-update/{id}`
- `POST /api/open-terminal`

## Scheduling daily updates

The dashboard currently documents two paths:

- **Phase 7 setup wizard + OS job** (preferred).
- **Claude Code `/schedule`** (legacy fallback) — still documented in
  [docs/scheduling.md](docs/scheduling.md).

### Legacy `/schedule` defaults

- Cadence: `0 9 * * *`
- Prompt: `Follow skill/SKILL.md end-to-end` with repo path and date context.

## Project layout

```text
LLM-Dash/
├── README.md
├── CLAUDE.md
├── AGENTS.md
├── LOGBOOK.md
├── TODO.md
├── requirements.txt
├── server.py
├── run.sh
├── run.bat
├── skill/
│   └── SKILL.md
├── docs/
│   ├── scheduling.md
│   └── plans/
│       ├── IMPLEMENTATION_PLAN.md
│       ├── M6_AGENT_PROVIDER_BACKEND_PLAN.md
│       ├── M6_5_UI_INTEGRATION_PLAN.md
│       └── M7_SETUP_WIZARD_PLAN.md
├── web/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── vendor/
│       ├── sql-wasm.js
│       ├── sql-wasm.wasm
│       ├── marked.min.js
│       └── uplot.iife.min.js
├── data/
│   ├── dash.sqlite
│   └── run_metrics.csv
├── scripts/
│   ├── schema.sql
│   ├── config.py
│   ├── run_update.py
│   ├── init_db.py
│   ├── export_metrics_csv.py
│   └── schedule_job.py
├── logs/                  # per-run logs
└── changelogs/
    └── 2026-xx-xx.md...
```

## Troubleshooting

- `python -m venv` missing on Debian/Ubuntu: install `python3-venv` and rerun
  the launcher.
- Port 8787 in use: run with `LLM_DASH_PORT=9000 ./run.sh`.
- Browser did not open: read the URL printed by the launcher; open it manually.
- First-run spinner hangs: check launcher logs and `scripts/init_db.py` output.

## Further reading

- [Implementation plan](docs/plans/IMPLEMENTATION_PLAN.md)
- [Task queue / roadmap](TODO.md)
- [Session notes](LOGBOOK.md)
- [Run protocol](skill/SKILL.md)
