#!/usr/bin/env python3
"""Reset local LLM-Dash state without touching auth stores or changelogs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.config import config_path
from scripts.schedule_job import SCHEDULE_PATH, remove_schedule, status as schedule_status

DB_PATH = ROOT / "data" / "dash.sqlite"
CSV_PATH = ROOT / "data" / "run_metrics.csv"
LOGS_DIR = ROOT / "logs"
DB_SIDECARS = (
    DB_PATH,
    DB_PATH.with_name(DB_PATH.name + "-wal"),
    DB_PATH.with_name(DB_PATH.name + "-shm"),
    DB_PATH.with_name(DB_PATH.name + "-journal"),
    CSV_PATH,
)


def _delete_file(path: Path, removed: list[str], *, dry_run: bool = False) -> None:
    if not path.exists():
        return
    removed.append(str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path))
    if not dry_run:
        path.unlink()


def reset_local_state(*, dry_run: bool = False) -> tuple[list[str], list[str]]:
    removed: list[str] = []
    warnings: list[str] = []

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


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset local LLM-Dash settings and generated data.")
    parser.add_argument("--dry-run", action="store_true", help="List files that would be removed without deleting them")
    args = parser.parse_args()

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
