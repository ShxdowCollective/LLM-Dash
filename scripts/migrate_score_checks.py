#!/usr/bin/env python3
"""Migrate model_scores to add CHECK constraints for 0-10 score range.

SQLite cannot ALTER TABLE to add CHECK constraints, so we rebuild:
1. Validate existing rows (reject if any out-of-range)
2. Create new table with CHECK constraints
3. Copy data
4. Drop old, rename new
5. Recreate indexes
6. Bump schema_version to 2
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "dash.sqlite"

TARGET_VERSION = 2
SCORE_COLS = ("intelligence", "coding", "agents", "speed", "cost")


def current_schema_version(con: sqlite3.Connection) -> int:
    try:
        row = con.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
        return int(row[0]) if row else 1
    except sqlite3.OperationalError:
        return 1
    except (TypeError, ValueError):
        return 1


def needs_migration(con: sqlite3.Connection) -> bool:
    return current_schema_version(con) < TARGET_VERSION


def validate_existing_scores(con: sqlite3.Connection) -> list[str]:
    errors: list[str] = []
    for col in SCORE_COLS:
        rows = con.execute(
            f"SELECT id, model_id, as_of, {col} FROM model_scores "
            f"WHERE {col} IS NOT NULL AND ({col} < 0 OR {col} > 10)"
        ).fetchall()
        for row in rows:
            errors.append(f"model_scores id={row[0]} model_id={row[1]} as_of={row[2]} {col}={row[3]} out of [0,10]")
    return errors


def migrate(db_path: Path = DB_PATH, *, dry_run: bool = False) -> bool:
    if not db_path.exists():
        return False

    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA foreign_keys = OFF")

        if not needs_migration(con):
            return False

        errors = validate_existing_scores(con)
        if errors:
            for err in errors:
                print(f"  validation error: {err}", file=sys.stderr)
            raise ValueError(f"{len(errors)} score(s) outside [0,10] range — fix before migrating")

        if dry_run:
            print(f"  migration needed: schema_version {current_schema_version(con)} → {TARGET_VERSION}")
            print(f"  validation passed: all scores in [0,10]")
            return True

        con.execute("BEGIN")

        con.execute("""
            CREATE TABLE model_scores_new (
                id              INTEGER PRIMARY KEY,
                model_id        INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
                as_of           TEXT NOT NULL,
                intelligence    REAL CHECK (intelligence IS NULL OR (intelligence BETWEEN 0 AND 10)),
                coding          REAL CHECK (coding IS NULL OR (coding BETWEEN 0 AND 10)),
                agents          REAL CHECK (agents IS NULL OR (agents BETWEEN 0 AND 10)),
                speed           REAL CHECK (speed IS NULL OR (speed BETWEEN 0 AND 10)),
                cost            REAL CHECK (cost IS NULL OR (cost BETWEEN 0 AND 10)),
                source_notes    TEXT,
                UNIQUE (model_id, as_of)
            )
        """)

        con.execute("""
            INSERT INTO model_scores_new (id, model_id, as_of, intelligence, coding, agents, speed, cost, source_notes)
            SELECT id, model_id, as_of, intelligence, coding, agents, speed, cost, source_notes
            FROM model_scores
        """)

        con.execute("DROP VIEW IF EXISTS v_models_latest")
        con.execute("DROP TABLE model_scores")
        con.execute("ALTER TABLE model_scores_new RENAME TO model_scores")

        con.execute("CREATE INDEX idx_scores_model_date ON model_scores(model_id, as_of DESC)")

        con.execute("""
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
        """)

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
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    try:
        migrated = migrate(db_path, dry_run=args.dry_run)
        if migrated:
            action = "would migrate" if args.dry_run else "migrated"
            print(f"{action} model_scores: added CHECK constraints, schema_version → {TARGET_VERSION}")
        else:
            print("no migration needed")
        return 0
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
