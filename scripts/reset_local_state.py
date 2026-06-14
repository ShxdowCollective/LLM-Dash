#!/usr/bin/env python3
"""Reset local LLM-Dash state.

Two layers:

1. `reset_local_state()` — the original all-or-nothing CLI reset: deletes the DB
   + sidecars + CSV + run logs + app config + schedule. Clears LLM-Dash broker
   grants/access tokens and the legacy Python grant cache. Voidware credentials,
   auth files, and keyring secrets are never deleted.
2. Scoped resets — `reset_stats`, `reset_changelog`, `reset_models`,
   `reset_full` — power the in-app **Settings → Reset** tab via `POST /api/reset`.
   These are deliberate, typed-confirmation operator actions. The changelog reset
   is the one sanctioned exception to the append-only rule (documented in
   CLAUDE.md / AGENTS.md / SKILL.md / docs/ARCHITECTURE.md); update runs stay
   append-only. Partial scopes leave credential grants alone; only `reset_full`
   and launcher reset clear grant metadata/access.
"""

from __future__ import annotations

import argparse
import csv as _csv
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.config import config_path
from scripts.schedule_job import SCHEDULE_PATH, remove_schedule, status as schedule_status
from scripts.voidware_auth import clear_llmdash_grants

DB_PATH = ROOT / "data" / "dash.sqlite"
CSV_PATH = ROOT / "data" / "run_metrics.csv"
CHANGELOGS_DIR = ROOT / "changelogs"
LOGS_DIR = ROOT / "logs"
DB_SIDECARS = (
    DB_PATH,
    DB_PATH.with_name(DB_PATH.name + "-wal"),
    DB_PATH.with_name(DB_PATH.name + "-shm"),
    DB_PATH.with_name(DB_PATH.name + "-journal"),
    CSV_PATH,
)

# Scope -> required typed confirmation token (validated server-side).
RESET_TOKENS = {"stats": "STATS", "changelog": "CHANGELOG", "models": "MODELS", "full": "RESET"}
METRICS_COLUMNS = [
    "changelog_date", "started_at", "completed_at", "duration_sec", "agent_name",
    "agent_runtime", "tokens_input", "tokens_output", "tokens_cached", "cost_usd",
    "exa_searches", "exa_fetches", "word_count", "notes",
]


def _delete_file(path: Path, removed: list[str], *, dry_run: bool = False) -> None:
    if not path.exists():
        return
    removed.append(str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path))
    if not dry_run:
        path.unlink()


def _selected_secret_names() -> list[str]:
    # Selected credential names from app config, captured before the config
    # file is deleted so cached grant entries for them can be derived.
    try:
        from scripts.config import CREDENTIAL_SLOTS, load_credential_slot

        names = []
        for slot in CREDENTIAL_SLOTS:
            selection = load_credential_slot(slot)
            if selection.credential_name:
                names.append(selection.credential_name)
        return names
    except Exception:
        return []


def reset_local_state(*, dry_run: bool = False) -> tuple[list[str], list[str]]:
    removed: list[str] = []
    warnings: list[str] = []

    grant_summary = clear_llmdash_grants(dry_run=dry_run, secret_names=_selected_secret_names())
    for warning in grant_summary.get("warnings") or []:
        warnings.append(str(warning))
    if dry_run:
        preview = grant_summary.get("revoked") or []
        if preview:
            removed.append(f"grants: would revoke {len(preview)} LLM-Dash grant(s)")
    else:
        revoked = grant_summary.get("revoked") or []
        if revoked:
            removed.append(f"grants: revoked {len(revoked)} LLM-Dash grant(s)")
        removed_cache = grant_summary.get("removed_cache") or []
        for item in removed_cache:
            removed.append(str(item))

    if dry_run:
        try:
            current_schedule = schedule_status()
            if current_schedule.get("enabled") or current_schedule.get("job_present"):
                manager = current_schedule.get("manager") or current_schedule.get("platform") or "schedule"
                job_id = current_schedule.get("job_id") or "configured job"
                removed.append(f"scheduled job: {manager}/{job_id}")
        except Exception as exc:
            warnings.append(f"schedule dry-run: {exc}")
    else:
        try:
            remove_schedule()
        except Exception as exc:
            warnings.append(f"schedule: {exc}")
    _delete_file(SCHEDULE_PATH, removed, dry_run=dry_run)

    _delete_file(config_path(), removed, dry_run=dry_run)

    for path in DB_SIDECARS:
        _delete_file(path, removed, dry_run=dry_run)

    for log_file in sorted(LOGS_DIR.glob("run-update-*.log")):
        _delete_file(log_file, removed, dry_run=dry_run)
    _delete_file(LOGS_DIR / "server.log", removed, dry_run=dry_run)
    _delete_file(LOGS_DIR / "scheduled-run.log", removed, dry_run=dry_run)

    return removed, warnings


def _export_metrics_csv(con: sqlite3.Connection) -> None:
    rows = con.execute(
        "SELECT changelog_date, started_at, completed_at, duration_sec, agent_name, "
        "agent_runtime, tokens_input, tokens_output, tokens_cached, cost_usd, "
        "exa_searches, exa_fetches, word_count, notes FROM run_metrics ORDER BY changelog_date"
    ).fetchall()
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = _csv.writer(f)
        writer.writerow(METRICS_COLUMNS)
        writer.writerows(rows)


def _delete_run_logs(removed: list[str]) -> None:
    for log_file in sorted(LOGS_DIR.glob("run-update-*.log")):
        _delete_file(log_file, removed)
    _delete_file(LOGS_DIR / "scheduled-run.log", removed)


def reset_stats() -> dict:
    """Clear run telemetry only. Models, scores, changelogs, and
    meta.last_updated are untouched."""
    if not DB_PATH.exists():
        raise FileNotFoundError("dash.sqlite not found")
    removed: list[str] = []
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("DELETE FROM run_metrics")
        _export_metrics_csv(con)
        con.commit()
    finally:
        con.close()
    _delete_run_logs(removed)
    return {"scope": "stats", "cleared": ["run_metrics", "run logs"], "removed_files": removed}


def reset_changelog() -> dict:
    """Delete all changelog entries and their run metrics. This is the one
    sanctioned exception to the append-only rule. last_updated is preserved
    because model data still reflects the last update."""
    if not DB_PATH.exists():
        raise FileNotFoundError("dash.sqlite not found")
    removed: list[str] = []
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA foreign_keys = OFF")
        # run_metrics.changelog_date references changelogs(date): clear it first.
        con.execute("DELETE FROM run_metrics")
        con.execute("DELETE FROM changelogs")
        _export_metrics_csv(con)
        con.commit()
    finally:
        con.close()
    for md in sorted(CHANGELOGS_DIR.glob("*.md")):
        _delete_file(md, removed)
    _delete_run_logs(removed)
    return {"scope": "changelog", "cleared": ["changelogs", "run_metrics"], "removed_files": removed}


def reset_models() -> dict:
    """Clear the model catalog and scores, and drop last_updated so freshness
    reads as never. Changelogs and stats are left alone. The dashboard routes
    to the setup wizard to re-seed the catalog (no bootstrap reseed)."""
    if not DB_PATH.exists():
        raise FileNotFoundError("dash.sqlite not found")
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("BEGIN")
        con.execute("DELETE FROM model_scores")
        con.execute("DELETE FROM models")
        con.execute("DELETE FROM meta WHERE key = 'last_updated'")
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()
    return {"scope": "models", "cleared": ["models", "model_scores"], "reseeded": 0}


def reset_full() -> dict:
    """Full local reset: delete the DB + sidecars + CSV + logs + app config +
    schedule, clear LLM-Dash broker grants. The next launch returns bootstrap
    state `needs_setup` and routes into the setup wizard (no auto-reseed).
    Voidware credentials and keyring secrets are NOT deleted."""
    removed, warnings = reset_local_state(dry_run=False)
    return {"scope": "full", "removed_files": removed, "warnings": warnings}


def run_scope(scope: str) -> dict:
    fns = {"stats": reset_stats, "changelog": reset_changelog, "models": reset_models, "full": reset_full}
    if scope not in fns:
        raise ValueError(f"unknown reset scope: {scope}")
    return fns[scope]()


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset local LLM-Dash settings and generated data.")
    parser.add_argument("--dry-run", action="store_true", help="List files that would be removed without deleting them")
    parser.add_argument("--scope", choices=list(RESET_TOKENS), help="Scoped reset: stats|changelog|models|full (destructive, no dry-run)")
    args = parser.parse_args()

    if args.scope:
        summary = run_scope(args.scope)
        print(f"reset scope={args.scope}: {json.dumps(summary)}")
        return 0

    removed, warnings = reset_local_state(dry_run=args.dry_run)
    prefix = "dry-run: would remove" if args.dry_run else "reset: removed"
    print(f"{prefix} {len(removed)} item(s)")
    for item in removed:
        print(f"  {item}")
    for warning in warnings:
        print(f"warning: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
