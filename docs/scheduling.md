# Legacy CLI scheduling via Claude Code `/schedule`

LLM-Dash's daily refresh runs through **any** AI agent, but the supported
first-party path is now the BYOK **Agent Provider** runner added in Phase 6.
This page documents the older Claude Code `/schedule` escape hatch and
existing-day-operations fallback.

The repo can't version-control a `/schedule` trigger (it lives in your local
Claude Code settings), so this doc pins the prompt and cadence you register
yourself.

## Why this still exists

- It is useful for environments that are not yet wired to the Phase 7 wizard.
- It helps with ad-hoc replay and testing of the old prompt flow.
- It does not own the schedule — your local Claude Code install does.

## Prerequisites

- Claude Code installed locally with your account logged in.
- The `/schedule` skill enabled (it ships with recent versions of Claude
  Code — run `claude /schedule` once to confirm it responds).
- LLM-Dash checked out at a stable absolute path — e.g. `~/Repos/LLM-Dash`
  on POSIX or `C:\Users\<you>\Repos\LLM-Dash` on Windows.

## Register the trigger

From any directory, in Claude Code:

```
/schedule
```

Fill it in roughly like this (adjust the path to match your checkout):

- **Name:** `llm-dash-daily`
- **Cron:** `0 9 * * *` (local time — 09:00 daily). Nudge earlier or later to
  taste; the skill is idempotent per-date, so a miss doesn't compound.
- **Prompt:**

  ```
  Follow skill/SKILL.md end-to-end to produce today's LLM-Dash update.
  Repo: /absolute/path/to/LLM-Dash
  Budget: no hard cap - log tokens, cost, and duration per SKILL.md §7.
  ```

The `/api/prompt` endpoint that the dashboard's **Refresh** button exposes
emits the same text with today's date and last-update timestamp filled in.
You can copy its output verbatim into the `/schedule` prompt if you'd rather
let the server build the string for you:

```bash
curl -s http://127.0.0.1:8787/api/prompt | python3 -c "import json,sys; print(json.load(sys.stdin)['prompt'])"
```

## Dry run before trusting the schedule

1. Start the server (`./run.sh` or `run.bat`).
2. Open the dashboard, click **Refresh**, paste the prompt into Claude Code
   manually, and let it run to completion.
3. Confirm the usual SKILL.md side effects:
   - new `changelogs/YYYY-MM-DD.md` with a `## Run Metadata` footer
   - fresh row in `run_metrics` (and mirrored in `data/run_metrics.csv`)
   - `meta.last_updated` moved forward
4. If that passes, the `/schedule` trigger should do the same thing unattended.
   For new installs, prefer the OS-level scheduled job (Phase 7) — systemd timer
   on Linux/WSL, launchd plist on macOS, or Task Scheduler on Windows. The setup
   wizard installs it for you, and the same job calls `scripts/run_update.py`
   through your configured Agent Provider with optional LLM Stats enrichment
   (Phase 8.11) when a key is present.

## Changing cadence or prompt

Re-run `/schedule` with the same name to edit the trigger; Claude Code will
overwrite the prior entry. If the trigger is stale or broken, use `/schedule`
again and choose delete.

## What the repo owns vs. what you own

- **Repo owns:** `skill/SKILL.md` (the procedure), `/api/prompt` (prompt text),
  Agent Provider config APIs, `scripts/run_update.py`, and local launchers
  (`run.sh` / `run.bat`).
- **You own:** the `/schedule` trigger in your Claude Code install, plus the
  absolute repo path it points at.

Keep this boundary honest. Don't add trigger config to the repo — it doesn't
survive a clone to another machine and will lie about what's actually
scheduled.
