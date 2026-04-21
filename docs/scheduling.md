# Daily updates via Claude Code `/schedule`

LLM-Dash's daily refresh runs through **any** AI agent, but the supported
automated path is Claude Code's `/schedule` slash command. The repo can't
version-control a `/schedule` trigger (it lives in your local Claude Code
settings), so this doc pins the prompt and cadence you register yourself.

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
4. If that passes, the `/schedule` trigger will do the same thing unattended.

## Changing cadence or prompt

Re-run `/schedule` with the same name to edit the trigger; Claude Code will
overwrite the prior entry. If you break the schedule and want to wipe the
slate, `/schedule` also exposes a delete action.

## What the repo owns vs. what you own

- **Repo owns:** `skill/SKILL.md` (the procedure), `/api/prompt` (the prompt
  text), `run.sh` / `run.bat` (local launch).
- **You own:** the `/schedule` trigger in your Claude Code install, plus the
  absolute repo path it points at.

Keep this boundary honest. Don't add trigger config to the repo — it doesn't
survive a clone to another machine and will lie about what's actually
scheduled.
