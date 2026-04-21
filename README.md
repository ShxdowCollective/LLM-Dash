# LLM-Dash

A no-build, click-to-launch local dashboard for tracking LLM benchmarks and
daily changelogs. Voidware aesthetic, JetBrains Mono everywhere, dark-only.

The app is a pure static HTML/CSS/JS bundle served by a tiny FastAPI server.
Daily research and changelog writing is performed by **any AI agent** (Claude
Code, Codex, Gemini CLI, …) following the agent-agnostic procedure in
[skill/SKILL.md](skill/SKILL.md). The UI is read-only.

## What this is

- **Static frontend.** No npm, no build step. Open `run.bat` (Windows) or
  `run.sh` (macOS/Linux) to start a local server and pop the dashboard in the
  default browser. Close the terminal to stop.
- **SQLite is the source of truth.** `data/dash.sqlite` holds every model,
  every score (append-only history), the changelog index, and per-run metrics.
  The frontend reads it in-browser via `sql.js` (SQLite-WASM) so complex
  filtering and search are real SQL queries.
- **Changelogs live on disk.** Every update produces `changelogs/YYYY-MM-DD.md`
  with a YAML frontmatter header and a required `## Run Metadata` footer
  (tokens, cost, duration, word count). Append-only — never overwritten.
- **Daily updates via any AI agent.** A Claude Code `/schedule` trigger fires
  once a day with the prompt "follow skill/SKILL.md." On demand, click
  **Refresh** in the UI — it copies a ready-to-paste prompt to your clipboard
  and offers to open a terminal. Paste into `claude`, `codex`, `gemini`,
  whatever.
- **CSV exports.** Download the filtered models table; download
  `run_metrics.csv` from the Stats page.
- **Stats dashboard.** Dedicated page for cost / token / duration totals,
  per-agent breakdown, time-series charts, word counts. All data comes from
  the `run_metrics` rows each update writes.

## Quick start (once built)

```bash
./run.sh          # macOS/Linux; or run.bat on Windows
```

Opens `http://127.0.0.1:8787` in the default browser.

## Project layout

```
LLM-Dash/
├── README.md
├── CLAUDE.md                    # pointer for Claude Code (follow skill/SKILL.md)
├── AGENTS.md                    # pointer for any AI agent (same)
├── TODO.md
├── LOGBOOK.md
├── requirements.txt             # fastapi, uvicorn
├── server.py                    # FastAPI app (static mount + /api/prompt + /api/open-terminal)
├── run.bat                      # Windows launcher
├── run.sh                       # POSIX launcher
├── skill/
│   └── SKILL.md                 # agent-agnostic daily-update procedure (source of truth)
├── docs/
│   └── plans/
│       └── IMPLEMENTATION_PLAN.md
├── web/                         # static app (served by server.py)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── vendor/                  # sql.js wasm, marked.js
├── data/
│   ├── dash.sqlite              # generated
│   └── run_metrics.csv          # generated mirror of run_metrics table
├── changelogs/                  # YYYY-MM-DD.md files, append-only
└── scripts/
    ├── schema.sql
    ├── init_db.py               # seed DB from the 34-model dataset
    └── export_metrics_csv.py    # regenerate run_metrics.csv from SQLite
```

## Running an update manually

Click **Refresh** in the dashboard. The prompt is auto-copied to your
clipboard; click **Open Terminal** to spawn a terminal in the repo; in your
agent CLI type:

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

Or just paste the prompt between quotes. When the agent finishes, refresh the
browser page — no live polling (yet).

## Status

Scaffold only. See
[docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md) for the
full design and [TODO.md](TODO.md) for the task queue.
