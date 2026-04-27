# LLM-Dash

A no-build, click-to-launch local dashboard for tracking LLM benchmarks and
daily changelogs. Voidware aesthetic, JetBrains Mono everywhere, dark-only.

The app is a pure static HTML/CSS/JS bundle served by a tiny FastAPI server.
Daily research and changelog writing can run through the configured **Agent
Provider** (BYOK OpenAI-compatible endpoint via the OpenAI Agents SDK) or
through any CLI agent (Claude Code, Codex, Gemini CLI, …) following
[skill/SKILL.md](skill/SKILL.md). The UI is still read-only until the Phase 6.5
controls land.

## What this is

- **Static frontend.** No npm, no build step. Run `./run.sh` (macOS/Linux) or
  `run.bat` (Windows) to start a local server and pop the dashboard in your
  default browser. Close the terminal window to stop.
- **SQLite is the source of truth.** `data/dash.sqlite` holds every model,
  every score (append-only history), the changelog index, and per-run metrics.
  The frontend reads it in-browser via `sql.js` (SQLite-WASM) so complex
  filtering and search are real SQL queries.
- **Changelogs live on disk.** Every update produces `changelogs/YYYY-MM-DD.md`
  with a YAML frontmatter header and a required `## Run Metadata` footer
  (tokens, cost, duration, word count). Append-only — never overwritten.
- **Daily updates via an Agent Provider or any CLI agent.** The backend now has
  secret-safe BYOK provider APIs and an OpenAI Agents SDK runner. Until the
  Phase 6.5 UI is wired, click **Refresh** to copy a ready-to-paste prompt and
  run it in `claude`, `codex`, `gemini`, whatever.
- **CSV exports.** Download the filtered models table; download
  `run_metrics.csv` from the Stats page.
- **Stats dashboard.** Dedicated page for cost / token / duration totals,
  per-agent breakdown, uPlot time-series charts, word counts. All data comes
  from the `run_metrics` rows each update writes.

## Quick start

**Requirements:** Python 3.10+.

```bash
./run.sh          # macOS/Linux
run.bat           # Windows (double-click or from a cmd shell)
```

Both launchers:

1. Create a repo-local `.venv` if missing (nothing touches your system Python).
2. Install the FastAPI server, Agent Provider, keyring, and HTTP dependencies
   inside that venv.
3. Start `uvicorn server:app` on `127.0.0.1:8787` (override with
   `LLM_DASH_PORT`).
4. Open the URL in your default browser once the server responds.
5. Stay in the foreground — close the terminal to stop the server.

First launch seeds `data/dash.sqlite` automatically; the UI shows a spinner
until that finishes.

### Desktop shortcuts

- **Windows:** right-click `run.bat` → *Create shortcut*, drag the shortcut to
  your desktop, rename to `LLM-Dash`. Double-clicking it boots the dashboard.
- **macOS:** open Automator → *New → Application*, add a *Run Shell Script*
  action with `cd "$HOME/Repos/LLM-Dash" && ./run.sh` (adjust path), save as
  `LLM-Dash.app` in `/Applications`. Drag to the Dock.
- **Linux:** drop a `.desktop` entry pointing `Exec=` at the absolute
  `run.sh` path, or just pin a terminal alias.

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

When the agent finishes, refresh the browser page — no live polling (yet).

## Agent Provider backend

M6 adds the backend API for BYOK providers. `POST /api/provider` saves
`base_url`, `api_key`, default/backup models, optional model-list override, and
request headers. It also accepts `endpoint_mode`: `append_v1` for standard
OpenAI-shaped roots, or `root` for providers whose documented base URL already
includes the OpenAI-compatible API root. Secrets go to the OS keychain first, then
`~/.shxdow/auth.json`; public config goes to
`~/.shxdow/config/shxdow.llmdash.json`. `GET /api/provider` never returns raw
keys, only non-secret provider config and derived endpoints.

`GET /api/provider-presets` serves the Phase 7 wizard catalog from
`web/provider-presets.json`: OpenAI, Anthropic OpenAI-compatible, Google AI
Studio, OpenRouter, Kilo Gateway, NanoGPT, and Custom OpenAI-compatible for
local servers like Ollama, llama.cpp, and LM Studio.

`scripts/run_update.py` runs the update through `openai-agents==0.14.6`.
`POST /api/run-update` starts it in the background and
`GET /api/run-update/{id}` polls state and a sanitized log tail.

## Scheduling daily updates

The old documented path is Claude Code's `/schedule` slash command. It remains
as a manual CLI escape hatch, but Phase 7 is replacing it with an OS-level job
that invokes the Agent Provider runner. Historical setup notes live in
[docs/scheduling.md](docs/scheduling.md). Short version:

- Cadence: `0 9 * * *` local time.
- Prompt: "Follow skill/SKILL.md end-to-end" + absolute repo path.
- `/schedule` state lives in your Claude Code install, not in the repo.

## Project layout

```
LLM-Dash/
├── README.md
├── CLAUDE.md                    # pointer for Claude Code (follow skill/SKILL.md)
├── AGENTS.md                    # pointer for any AI agent (same)
├── TODO.md
├── LOGBOOK.md
├── requirements.txt             # FastAPI, uvicorn, keyring, httpx, Agents SDK
├── server.py                    # FastAPI app (static mount + /api/* routes)
├── run.sh                       # POSIX launcher (creates .venv, starts server)
├── run.bat                      # Windows launcher (same)
├── skill/
│   └── SKILL.md                 # agent-agnostic daily-update procedure
├── docs/
│   ├── scheduling.md            # Claude Code /schedule setup
│   └── plans/
│       └── IMPLEMENTATION_PLAN.md
├── web/                         # static app (served by server.py)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── vendor/                  # sql.js, marked.js, uPlot
├── data/
│   ├── dash.sqlite              # generated
│   └── run_metrics.csv          # generated mirror of run_metrics table
├── changelogs/                  # YYYY-MM-DD.md files, append-only
└── scripts/
    ├── schema.sql
    ├── config.py                # Agent Provider config + credentials
    ├── run_update.py            # OpenAI Agents SDK update runner
    ├── init_db.py               # seed DB from the 34-model dataset
    └── export_metrics_csv.py    # regenerate run_metrics.csv from SQLite
```

## Troubleshooting

- **`python -m venv` fails on Debian/Ubuntu** → `sudo apt install python3-venv`
  (or the versioned variant the error message names). Then re-run the
  launcher.
- **Port 8787 already in use** → `LLM_DASH_PORT=9000 ./run.sh` (or set the
  env var before double-clicking `run.bat`).
- **Browser didn't auto-open** → the launcher prints the URL; open it
  yourself. The server keeps running either way.
- **First-run spinner never clears** → check the uvicorn logs in the
  launcher's terminal; `scripts/init_db.py` printed a traceback if seeding
  failed. Re-run manually with `python scripts/init_db.py`.

## More

- Architecture: [docs/plans/IMPLEMENTATION_PLAN.md](docs/plans/IMPLEMENTATION_PLAN.md)
- Task queue: [TODO.md](TODO.md)
- Session log: [LOGBOOK.md](LOGBOOK.md)
