#!/usr/bin/env python3
"""Regenerate data/run_metrics.csv from the run_metrics table in
data/dash.sqlite. Run this after every daily update per skill/SKILL.md §8.
"""

from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "dash.sqlite"
CSV_PATH = ROOT / "data" / "run_metrics.csv"

COLUMNS = [
    "changelog_date", "started_at", "completed_at", "duration_sec",
    "agent_name", "agent_runtime", "tokens_input", "tokens_output",
    "tokens_cached", "cost_usd", "exa_searches", "exa_fetches",
    "word_count", "notes",
]


def main() -> None:
    if not DB_PATH.exists():
        print(f"missing {DB_PATH.relative_to(ROOT)} — run init_db.py first",
              file=sys.stderr)
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

    print(f"wrote {CSV_PATH.relative_to(ROOT)} ({len(rows)} row(s))")


if __name__ == "__main__":
    main()
