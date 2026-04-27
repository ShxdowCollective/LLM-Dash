<p align="right">
  <a href="https://buymeacoffee.com/shxdowenby">
    <img src=".github/bmc-button.png" alt="Buy Me a Coffee" height="40">
  </a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/dashboard/default/48px.svg">
  <img alt="LLM-Dash" height="48" src="https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/dashboard/default/48px.svg">
</picture>

# LLM-Dash

**Local LLM benchmark dashboard with AI-driven daily changelog updates.**

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-3776ab?logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![sql.js](https://img.shields.io/badge/sql.js-WASM-4B32C3)](https://sql.js.org)
[![voidware](https://img.shields.io/badge/voidware-v0.7.1-7c5cc4)](https://github.com/shxdow)
[![License: MIT](https://img.shields.io/badge/license-MIT-a6f17b)](LICENSE)
[![OpenAI Agents SDK](https://img.shields.io/badge/OpenAI_Agents-SDK-412991?logo=openai&logoColor=white)](https://github.com/openai/openai-agents-python)

---

<p align="center">
  <code style="font-family: 'JetBrains Mono', monospace; font-size: 1.1em; letter-spacing: 0.04em; color: #f3f3ee;">
    track · compare · update — entirely local
  </code>
</p>

---

> A no-build, click-to-launch dashboard for tracking LLM benchmarks and daily
> model changelogs. Voidware-powered dark UI. SQLite source of truth. AI agents
> write the updates — you just watch.

## Features

- **Models leaderboard** — sortable table with five benchmark dimensions
  (intelligence, coding, agents, speed, cost), tier grades S–F, and per-vendor
  color coding.
- **Interactive charts** — horizontal bar comparisons powered by uPlot.
- **Changelog timeline** — append-only daily entries rendered from Markdown,
  with full-text search.
- **Stats & analytics** — token usage, cost tracking, duration metrics, and
  per-agent breakdowns across every update run.
- **Setup wizard** — first-run walkthrough configures your BYOK provider,
  models, Exa API key, and OS-level scheduling in under two minutes.
- **Agent-agnostic updates** — any AI agent (Claude, Codex, Gemini, etc.)
  follows `skill/SKILL.md` to research, score, and commit new data.
- **Zero build step** — vanilla HTML/CSS/JS served by a tiny FastAPI server.
  No npm, no bundler, no node_modules.
- **Works offline** — once launched, the dashboard runs entirely from local
  SQLite + WASM. Internet is only needed for update runs.

## Quick Start

### Requirements

- Python 3.10+
- Internet access for first-time dependency install and model updates

### Launch

```bash
# macOS / Linux
./run.sh

# Windows
run.bat
```

The launcher handles everything:

1. Creates and activates a local `.venv`
2. Installs dependencies from `requirements.txt`
3. Starts `uvicorn server:app` on `127.0.0.1:8787`
4. Opens the dashboard in your default browser

> **Override host/port:**
> `LLM_DASH_HOST=0.0.0.0 LLM_DASH_PORT=9000 ./run.sh`

### Silent / Background Mode

```bash
./run.sh --silent     # macOS / Linux
run.bat --silent      # Windows
```

Detaches the server, skips browser launch, logs to `logs/server.log`, and
prints only the dashboard URL. Ideal for startup tasks or long-running sessions.

For LAN access:

```bash
LLM_DASH_HOST=0.0.0.0 ./run.sh --silent
```

### Desktop Shortcuts

| Platform | How |
|---|---|
| **Windows** | Right-click `run.bat` → Create shortcut → pin to desktop |
| **macOS** | Automator → Run Shell Script → `cd ~/Repos/LLM-Dash && ./run.sh` → save as `.app` |
| **Linux** | Create a `.desktop` entry with `Exec=` pointing to your `run.sh` |

## How Updates Work

LLM-Dash separates **reading** (the dashboard) from **writing** (AI agents).
The UI is read-only; all data changes come from update runs.

### Automated (Agent Provider)

After completing the setup wizard, click **Refresh** in the dashboard header.
The app dispatches `skill/SKILL.md` to your configured provider via the OpenAI
Agents SDK. Progress streams live in an overlay.

### Manual (CLI Fallback)

If no provider is configured, **Refresh** copies an agent-neutral prompt to
your clipboard and offers to open a terminal:

```bash
# macOS
claude "$(pbpaste)"
codex  "$(pbpaste)"

# Linux
claude "$(xclip -selection clipboard -o)"

# Windows PowerShell
claude (Get-Clipboard)
codex  (Get-Clipboard)
```

### Scheduled

The setup wizard can install an OS-level scheduled job (systemd timer, launchd
plist, or Windows Task Scheduler) to run updates automatically — daily, weekly,
or monthly.

## Project Layout

```text
LLM-Dash/
├── server.py              # FastAPI app — API routes + static mounts
├── run.sh / run.bat       # One-click launchers
├── requirements.txt       # Python deps (FastAPI, uvicorn, openai-agents, ...)
│
├── web/                   # Static frontend (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── style.css          # Voidware v0.7.1 design tokens
│   ├── app.js             # sql.js bootstrap, state, rendering
│   └── vendor/            # Vendored libs (sql-wasm, marked, uPlot)
│
├── data/
│   ├── dash.sqlite        # Source of truth
│   └── run_metrics.csv    # Human-readable metrics mirror
│
├── changelogs/            # Append-only daily Markdown files
│   └── YYYY-MM-DD.md
│
├── scripts/
│   ├── schema.sql         # SQLite DDL
│   ├── config.py          # Provider config + credential layer
│   ├── init_db.py         # First-run DB seeder
│   ├── run_update.py      # Agents SDK update executor
│   ├── export_metrics_csv.py
│   ├── schedule_job.py    # OS-level job installer
│   └── launch_server.py   # Silent-mode server manager
│
├── skill/
│   └── SKILL.md           # Agent-agnostic update contract
│
├── docs/
│   ├── ARCHITECTURE.md    # System architecture deep-dive
│   ├── DEVELOPMENT.md     # Developer / contributor guide
│   └── scheduling.md      # Scheduling reference
│
├── CLAUDE.md              # Claude-specific agent instructions
├── AGENTS.md              # Generic agent guide
└── TODO.md                # Task board / roadmap
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `python -m venv` fails on Debian/Ubuntu | Install `python3-venv` and rerun the launcher |
| Port 8787 already in use | `LLM_DASH_PORT=9000 ./run.sh` |
| LAN access not working | Start with `LLM_DASH_HOST=0.0.0.0` and allow the port through your firewall |
| Browser didn't open | Copy the URL from terminal output and open manually |
| First-run spinner hangs | Check `logs/server.log` and `scripts/init_db.py` output |
| Setup wizard won't connect | Verify your API key and base URL; check the "Test Connection" result |

## Documentation

| Document | Audience | Contents |
|---|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Developers | System design, data flow, schema, component map |
| [Development](docs/DEVELOPMENT.md) | Contributors | Local setup, code conventions, testing, adding features |
| [Update Protocol](skill/SKILL.md) | AI Agents | Step-by-step update contract |
| [Task Board](TODO.md) | Everyone | Roadmap and progress tracker |
