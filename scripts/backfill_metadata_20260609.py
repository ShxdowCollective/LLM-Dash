#!/usr/bin/env python3
"""One-off sync of researched card_url / input_capabilities / deprecation metadata
from the MODELS seed in scripts/init_db.py into a live data/dash.sqlite."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.init_db import MODELS
from scripts.run_update import canonical_capabilities

DB_PATH = ROOT / "data" / "dash.sqlite"

PROTECTED_ROWS = frozenset({"Gemma 4 31B Dense", "Gemma 4 E4B", "MiMo-V2-Omni"})
DEPRECATION_ALLOWLIST = {
    "GPT-5.1-Codex-Mini": ("deprecated", "2026-04-22"),
    "Grok Code Fast 1": ("deprecated", "2026-05-15"),
}


def _parse_capabilities(raw: str | None) -> set[str]:
    if not raw:
        return {"text"}
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return {"text"}
    return {str(v).strip().lower() for v in items}


def _seed_by_name() -> dict[str, dict]:
    return {m["name"]: m for m in MODELS}


def backfill(db_path: Path, *, dry_run: bool) -> int:
    if not db_path.exists():
        print(f"error: {db_path} not found", file=sys.stderr)
        return 1

    seed = _seed_by_name()
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        live_rows = con.execute(
            "SELECT id, name, card_url, input_capabilities, status, deprecated_on "
            "FROM models ORDER BY name"
        ).fetchall()
    finally:
        con.close()

    live_by_name = {row["name"]: row for row in live_rows}
    matched = 0
    card_url_updated = 0
    capabilities_updated = 0
    status_updated = 0
    skipped = 0
    guard_failures: list[str] = []

    updates: list[tuple[dict, dict]] = []

    for name, seed_entry in seed.items():
        live = live_by_name.get(name)
        if live is None:
            print(f"warn: seed entry has no live match: {name}", file=sys.stderr)
            continue
        matched += 1

        changes: dict[str, tuple] = {}
        new_card_url = None
        new_capabilities = None
        new_status = None
        new_deprecated_on = None

        if "card_url" in seed_entry:
            new_card_url = seed_entry["card_url"]
            if live["card_url"] != new_card_url:
                changes["card_url"] = (live["card_url"], new_card_url)

        if "input_capabilities" in seed_entry:
            new_capabilities = canonical_capabilities(seed_entry["input_capabilities"])
            if live["input_capabilities"] != new_capabilities:
                if name in PROTECTED_ROWS:
                    live_caps = _parse_capabilities(live["input_capabilities"])
                    new_caps = _parse_capabilities(new_capabilities)
                    dropped = live_caps - new_caps
                    if dropped:
                        guard_failures.append(
                            f"{name}: would drop modalities {sorted(dropped)} "
                            f"({live['input_capabilities']} -> {new_capabilities})"
                        )
                        continue
                changes["input_capabilities"] = (live["input_capabilities"], new_capabilities)

        if name in DEPRECATION_ALLOWLIST:
            new_status, new_deprecated_on = DEPRECATION_ALLOWLIST[name]
            if live["status"] != new_status or live["deprecated_on"] != new_deprecated_on:
                changes["status"] = (live["status"], new_status)
                changes["deprecated_on"] = (live["deprecated_on"], new_deprecated_on)

        if not changes:
            skipped += 1
            continue

        if dry_run:
            print(f"{name}:")
            for field, (old, new) in changes.items():
                print(f"  {field}: {old!r} -> {new!r}")
        else:
            updates.append((dict(live), {
                "card_url": new_card_url,
                "input_capabilities": new_capabilities,
                "status": new_status,
                "deprecated_on": new_deprecated_on,
                "changes": changes,
            }))

        if "card_url" in changes:
            card_url_updated += 1
        if "input_capabilities" in changes:
            capabilities_updated += 1
        if "status" in changes or "deprecated_on" in changes:
            status_updated += 1

    for name in live_by_name:
        if name not in seed:
            print(f"warn: live row has no seed match: {name}", file=sys.stderr)

    if guard_failures:
        for msg in guard_failures:
            print(f"error: {msg}", file=sys.stderr)
        return 1

    if dry_run:
        print(
            f"dry-run summary: matched={matched} card_url={card_url_updated} "
            f"capabilities={capabilities_updated} status={status_updated} "
            f"skipped={skipped}"
        )
        return 0

    con = sqlite3.connect(db_path)
    try:
        con.execute("BEGIN")
        for live, patch in updates:
            sets = []
            params: list = []
            if "card_url" in patch["changes"]:
                sets.append("card_url = ?")
                params.append(patch["card_url"])
            if "input_capabilities" in patch["changes"]:
                sets.append("input_capabilities = ?")
                params.append(patch["input_capabilities"])
            if "status" in patch["changes"]:
                sets.append("status = ?")
                params.append(patch["status"])
            if "deprecated_on" in patch["changes"]:
                sets.append("deprecated_on = ?")
                params.append(patch["deprecated_on"])
            if sets:
                params.append(live["id"])
                con.execute(
                    f"UPDATE models SET {', '.join(sets)} WHERE id = ?",
                    params,
                )
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()

    print(
        f"applied: matched={matched} card_url={card_url_updated} "
        f"capabilities={capabilities_updated} status={status_updated} "
        f"skipped={skipped}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print per-row field diffs without writing",
    )
    args = parser.parse_args()
    return backfill(Path(args.db_path), dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
