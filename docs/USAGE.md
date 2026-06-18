# LLM-Dash — Usage Guide

Detailed usage for LLM-Dash. For a quick overview and the fastest path to
running, see the [README](../README.md). For development, see
[DEVELOPMENT.md](DEVELOPMENT.md).

---

## Installing

### From a checkout

```bash
# macOS / Linux
./install.sh
llm-dash start

# Windows
.\install.bat
llm-dash start
```

The installer:

1. Creates and activates a local `.venv`
2. Installs dependencies from `requirements.txt`
3. Registers a managed `llm-dash` command shim

`llm-dash start` starts `uvicorn server:app` on `127.0.0.1:8787` and opens the
dashboard in your default browser.

### From a release archive

Download `llm-dash-vX.Y.Z.zip` or `llm-dash-vX.Y.Z.tar.gz` from the GitHub
release, extract, and run the same install/start commands from the extracted
directory:

```bash
tar -xzf llm-dash-vX.Y.Z.tar.gz
cd llm-dash-vX.Y.Z
./install.sh
llm-dash start
```

Windows:

```powershell
Expand-Archive .\llm-dash-vX.Y.Z.zip
cd .\llm-dash-vX.Y.Z
.\install.bat
llm-dash start
```

`install.bat` wraps the PowerShell installer with execution-policy bypass for
fresh downloads. You can still run `powershell -ExecutionPolicy Bypass -File
.\install.ps1` directly if you prefer.

When `install.bat` or `llm-dash.cmd` is launched from a WSL UNC path such as
`\\wsl.localhost\Debian\home\...\LLM-Dash`, it delegates to the matching shell
command inside that distro instead of trying to create a Windows virtualenv on
the UNC path.

### Override host / port

```bash
llm-dash start --host 0.0.0.0 --port 9000
```

---

## Running Modes

### Silent / background

```bash
llm-dash start --silent
llm-dash status
llm-dash stop
```

`--silent` detaches the server, skips browser launch, logs to `logs/server.log`,
writes managed process state under `.llm-dash/server.json`, and prints only the
dashboard URL. Ideal for startup tasks or long-running sessions.

For LAN access:

```bash
llm-dash start --host 0.0.0.0 --silent
```

> Binding to `0.0.0.0` exposes the dashboard to your local network. Treat it as
> trusted-network only and allow the port through your firewall deliberately.

### Reset to first run

```bash
llm-dash reset --dry-run      # preview what would be deleted
llm-dash reset                # clear local state
llm-dash start --reset        # clear local state and open setup mode
```

Clears local provider/schedule settings, deletes generated dashboard data and
run logs, revokes LLM-Dash's own Voidware broker grants/access tokens, clears
saved UI preferences, and opens the guided setup wizard (`?setup=1`) to seed the
catalog from scratch (no auto-reseed).

Historical `changelogs/*.md`, Voidware credentials, the legacy
`~/.shxdow/auth.json`, and keyring/keystore secrets are **never** deleted.

Saved Voidware credentials use the local Voidware 1.1.0 package and CLI service
bridge. For source-tree testing, set `VOIDWARE_CLI_SERVICE_MODULE` to the built
Voidware CLI service entry.

### Desktop shortcuts

| Platform | How |
|---|---|
| **Windows** | Create a shortcut to `llm-dash.cmd start` or the installed `llm-dash` command |
| **macOS** | Automator → Run Shell Script → `cd /path/to/LLM-Dash && ./llm-dash start` → save as `.app` |
| **Linux** | Create a `.desktop` entry with `Exec=llm-dash start` |

---

## How Updates Work

LLM-Dash separates **reading** (the dashboard) from **writing** (AI agents).
Benchmark data changes come from update runs; Settings only writes local
provider, research, and schedule configuration.

### Automated (Agent Provider)

After configuring the Provider and Models settings, click **Refresh** in the
dashboard sidebar footer. The app dispatches `skill/SKILL.md` to your configured
provider via the OpenAI Agents SDK. Progress streams live in an overlay.

### Manual (CLI fallback)

If no provider is configured, **Refresh** copies an agent-neutral prompt to your
clipboard and offers to open a terminal:

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

The Schedule settings subpage can install an OS-level scheduled job (systemd
timer, launchd plist, or Windows Task Scheduler) to run updates automatically —
daily, weekly, or monthly. See [scheduling.md](scheduling.md) for details.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `python -m venv` fails on Debian/Ubuntu | Install `python3-venv` and rerun `./install.sh` |
| `llm-dash` command not found after install | Open a new terminal, add the printed shim directory to `PATH`, or run `./llm-dash start` / `.\llm-dash.cmd start` from the repo |
| `CMD does not support UNC paths` when using WSL | Use `install.bat` or `llm-dash.cmd` from the repo; they delegate WSL UNC paths to `wsl.exe` |
| Port 8787 already in use | `llm-dash start --port 9000` |
| Need to stop a background server | `llm-dash stop` |
| LAN access not working | Start with `llm-dash start --host 0.0.0.0` and allow the port through your firewall |
| Browser didn't open | Copy the URL from terminal output and open manually |
| First launch shows the setup wizard | Expected — there is no default catalog; seed it from the **Catalog** step (or run `python scripts/init_db.py` to preseed offline) |
| Seed run fails | Check the seed job log under `logs/`; retry from the wizard or run `python scripts/seed_catalog.py --preset exa --count 10` |
| Provider connection fails | Verify your API key and base URL; check the Settings "Test connection" result |
