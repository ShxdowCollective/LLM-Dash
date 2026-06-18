#!/usr/bin/env python3
"""Add models.input_capabilities and models.deprecated_on (schema_version 3 -> 4).

Adds two columns if missing, recreates v_models_latest so its `m.*` expansion
picks up the new columns, and bumps meta.schema_version to 4. Idempotent.

No non-default backfill: `input_capabilities` defaults to `["text"]` and
`deprecated_on` stays NULL. We do not guess modality or deprecation dates from
prose (parallels the "no invented scores" rule); update runs fill the rest from
cited primary sources.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "dash.sqlite"

TARGET_VERSION = 4
DEFAULT_CAPABILITIES = '["text"]'

VIEW_SQL = """
CREATE VIEW v_models_latest AS
SELECT m.*,
       s.as_of AS scores_as_of,
       s.intelligence, s.coding, s.agents, s.speed, s.cost
FROM models m
LEFT JOIN model_scores s ON s.id = (
    SELECT id FROM model_scores
    WHERE model_id = m.id
    ORDER BY as_of DESC, id DESC
    LIMIT 1
)
"""


def _current_version(con: sqlite3.Connection) -> int:
    try:
        row = con.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
        return int(row[0]) if row else 1
    except (sqlite3.OperationalError, TypeError, ValueError):
        return 1


def migrate(db_path: Path = DB_PATH) -> bool:
    if not db_path.exists():
        return False
    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA foreign_keys = OFF")
        cols = {r[1] for r in con.execute("PRAGMA table_info(models)")}
        already = "input_capabilities" in cols and "deprecated_on" in cols
        if already and _current_version(con) >= TARGET_VERSION:
            return False
        con.execute("BEGIN")
        if "input_capabilities" not in cols:
            con.execute(
                "ALTER TABLE models ADD COLUMN input_capabilities TEXT NOT NULL "
                f"DEFAULT '{DEFAULT_CAPABILITIES}'"
            )
            print("added models.input_capabilities")
        else:
            print("models.input_capabilities already present")
        if "deprecated_on" not in cols:
            con.execute("ALTER TABLE models ADD COLUMN deprecated_on TEXT")
            print("added models.deprecated_on")
        else:
            print("models.deprecated_on already present")
        # Recreate the view so `m.*` includes the new columns (SQLite expands *
        # at view-create time).
        con.execute("DROP VIEW IF EXISTS v_models_latest")
        con.execute(VIEW_SQL)
        print("recreated v_models_latest")
        con.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(TARGET_VERSION),),
        )
        con.execute("COMMIT")
        con.execute("PRAGMA foreign_keys = ON")
        return True
    except Exception:
        try:
            con.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    finally:
        con.close()


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", default=str(DB_PATH))
    args = parser.parse_args()
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"error: {db_path} not found", file=sys.stderr)
        return 1
    migrated = migrate(db_path)
    print(f"schema_version -> {TARGET_VERSION}" if migrated else "no migration needed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
