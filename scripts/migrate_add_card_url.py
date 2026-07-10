#!/usr/bin/env python3
"""Add models.card_url (schema_version 2 -> 3).

Adds the column if missing, recreates v_models_latest so its `m.*` expansion
picks up the new column, backfills existing rows from a per-vendor official
docs map, and bumps meta.schema_version. Idempotent.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "dash.sqlite"

# Keep in sync with init_db.VENDOR_CARD_URL.
VENDOR_CARD_URL = {
    "OpenAI": "https://platform.openai.com/docs/models",
    "Anthropic": "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    "Google": "https://ai.google.dev/gemini-api/docs/models",
    "Alibaba": "https://qwenlm.github.io/blog/",
    "MiniMax": "https://platform.minimax.io/docs/guides/text-generation",
    "Zhipu AI (Z.ai)": "https://docs.z.ai/guides/llm/glm-4.6",
    "Moonshot AI": "https://platform.moonshot.ai/docs/introduction",
    "NVIDIA": "https://build.nvidia.com/nvidia",
    "Xiaomi": "https://huggingface.co/XiaomiMiMo",
    "xAI": "https://docs.x.ai/docs/models",
}

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
        version = _current_version(con)
        if "card_url" in cols and version >= 3:
            return False
        con.execute("BEGIN")
        if "card_url" not in cols:
            con.execute("ALTER TABLE models ADD COLUMN card_url TEXT")
            print("added models.card_url")
        else:
            print("models.card_url already present")
        # Recreate the view so `m.*` includes card_url (SQLite expands * at
        # view-create time).
        con.execute("DROP VIEW IF EXISTS v_models_latest")
        con.execute(VIEW_SQL)
        print("recreated v_models_latest")
        filled = 0
        for vendor, url in VENDOR_CARD_URL.items():
            cur = con.execute(
                "UPDATE models SET card_url = ? WHERE vendor = ? AND (card_url IS NULL OR card_url = '')",
                (url, vendor),
            )
            filled += cur.rowcount
        print(f"backfilled card_url on {filled} rows")
        # Repair a v4 database that skipped this migration without downgrading
        # its version marker. The v4 migration will run next for real v2/v3 DBs.
        target_version = max(version, 3)
        con.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(target_version),),
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
    print("schema_version -> at least 3" if migrated else "no migration needed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
