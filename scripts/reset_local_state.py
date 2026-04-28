#!/usr/bin/env python3
"""Reset local LLM-Dash state without touching auth stores or changelogs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.config import config_path
from scripts.schedule_job import SCHEDULE_PATH, remove_schedule

DB_PATH = ROOT / "data" / "dash.sqlite"
CSV_PATH = ROOT / "data" / "run_metrics.csv"
DB_SIDEcars = (
    DB_PATH,
    DB_PATH.with_name(DB_PATH.name + "-wal"),
    DB_PATH.with_name(DB_PATH.name + "-shm"),
    DB_PATH.with_name(DB_PATH.name + "-journal"),
    CSV_PATH,
)


def _delete_file(path: Path, removed: list[str]) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return
    removed.append(str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path))


def reset_local_state() -> tuple[list[str], list[str]]:
    removed: list[str] = []
    warnings: list[str] = []

    try:
        remove_schedule()
    except Exception as exc:
        warnings.append(f"schedule: {exc}")
    _delete_file(SCHEDULE_PATH, removed)

    _delete_file(config_path(), removed)

    for path in DB_SIDEcars:
        _delete_file(path, removed)

    return removed, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset local LLM-Dash settings and generated data.")
    parser.parse_args()

    removed, warnings = reset_local_state()
    print(f"reset: removed {len(removed)} item(s)")
    for warning in warnings:
        print(f"warning: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
