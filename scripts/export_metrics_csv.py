#!/usr/bin/env python3
"""Regenerate run_metrics.csv from the active LLM-Dash database.

Run this after every daily update per skill/SKILL.md section 8.
"""

from __future__ import annotations

import csv
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("LLM_DASH_DATA_DIR") or (ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "dash.sqlite"
CSV_PATH = DATA_DIR / "run_metrics.csv"

COLUMNS = [
    "changelog_date", "started_at", "completed_at", "duration_sec",
    "agent_name", "agent_runtime", "tokens_input", "tokens_output",
    "tokens_cached", "cost_usd", "exa_searches", "exa_fetches",
    "word_count", "notes",
]


def main() -> None:
    if not DB_PATH.exists():
        print(f"missing {_display_path(DB_PATH)} - run init_db.py first", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.execute(
            """SELECT changelog_date, started_at, completed_at, duration_sec,
                      agent_name, agent_runtime, tokens_input, tokens_output,
                      tokens_cached, cost_usd, exa_searches, exa_fetches,
                      word_count, notes
               FROM run_metrics ORDER BY changelog_date"""
        )
        rows = cur.fetchall()
    finally:
        con.close()

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(rows)

    print(f"wrote {_display_path(CSV_PATH)} ({len(rows)} row(s))")


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
