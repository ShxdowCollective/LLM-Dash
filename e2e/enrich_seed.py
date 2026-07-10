#!/usr/bin/env python3
"""Post-seed enrichment for the hermetic e2e data dir only.

Adds two run_metrics rows (with matching changelogs + .md files) and a second
model_scores snapshot for a handful of models so Stats trend charts, sparklines,
and the agent leaderboard are assertable. Never touches scripts/init_db.py or
the real data/ tree.
"""

from __future__ import annotations

import csv
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("LLM_DASH_DATA_DIR") or (ROOT / "e2e" / ".tmp" / "data")).resolve()
CHANGELOGS_DIR = Path(
    os.environ.get("LLM_DASH_CHANGELOGS_DIR") or (ROOT / "e2e" / ".tmp" / "changelogs")
).resolve()
DB_PATH = DATA_DIR / "dash.sqlite"
CSV_PATH = DATA_DIR / "run_metrics.csv"

# Deterministic enrichment constants (consumed by Playwright specs).
PERMALINK_MODEL_NAME = "Claude Sonnet 4.6"
SCORE_HISTORY_MODELS = (
    "GPT-5.4",
    "Gemini 3.1 Pro",
    "Claude Opus 4.7",
    "Claude Sonnet 4.6",
    "GPT-5.4 mini",
)
SCORE_AS_OF = "2026-05-10"

RUNS = (
    {
        "date": "2026-05-01",
        "title": "May 1, 2026",
        "started_at": "2026-05-01T14:30:00Z",
        "completed_at": "2026-05-01T14:50:00Z",
        "duration_sec": 1200.0,
        "agent_name": "claude-sonnet-4-6",
        "agent_runtime": "claude-code",
        "tokens_input": 48_200,
        "tokens_output": 31_400,
        "tokens_cached": 5_100,
        "cost_usd": 0.47,
        "word_count": 412,
        "summary": "E2E enrichment run — score refresh for five frontier models.",
        "changed": [],
    },
    {
        "date": "2026-05-15",
        "title": "May 15, 2026",
        "started_at": "2026-05-15T09:15:00Z",
        "completed_at": "2026-05-15T09:30:00Z",
        "duration_sec": 900.0,
        "agent_name": "claude-opus-4-8",
        "agent_runtime": "claude-code",
        "tokens_input": 39_800,
        "tokens_output": 24_600,
        "tokens_cached": 2_900,
        "cost_usd": 0.33,
        "word_count": 388,
        "summary": "E2E enrichment run — follow-up tuning pass on two OpenAI models.",
        "changed": [],
    },
)

# Slight score deltas vs the bootstrap row (still within 0–10).
SCORE_DELTAS = {
    "GPT-5.4": {"intelligence": 0.1, "coding": 0.2, "agents": 0.1, "speed": 0.0, "cost": -0.1},
    "Gemini 3.1 Pro": {"intelligence": 0.2, "coding": 0.0, "agents": 0.1, "speed": 0.1, "cost": 0.0},
    "Claude Opus 4.7": {"intelligence": 0.0, "coding": 0.1, "agents": 0.2, "speed": -0.1, "cost": 0.0},
    "Claude Sonnet 4.6": {"intelligence": 0.1, "coding": 0.1, "agents": 0.0, "speed": 0.2, "cost": 0.1},
    "GPT-5.4 mini": {"intelligence": 0.0, "coding": 0.1, "agents": 0.1, "speed": 0.1, "cost": -0.2},
}


def render_changelog_md(run: dict) -> str:
    fm = "\n".join(
        [
            "---",
            f"date: {run['date']}",
            f"generated_at: {run['completed_at']}",
            f"agent: {run['agent_name']}",
            f"agent_runtime: {run['agent_runtime']}",
            "new_models: []",
            f"changes: {json.dumps(run['changed'])}",
            "---",
        ]
    )
    changed = ", ".join(run["changed"])
    score_copy = (
        f"{changed} — synthetic e2e-only deltas for sparkline coverage."
        if changed
        else "Five frontier models received synthetic e2e-only deltas for sparkline coverage."
    )
    body = f"""# E2E enrichment entry

{run['summary']}

## Score Changes

{score_copy}
"""
    footer = f"""---

## Run Metadata

| metric | value |
|---|---|
| agent | {run['agent_name']} |
| agent_runtime | {run['agent_runtime']} |
| started_at | {run['started_at']} |
| completed_at | {run['completed_at']} |
| duration_sec | {run['duration_sec']} |
| input_tokens | {run['tokens_input']} |
| output_tokens | {run['tokens_output']} |
| cached_tokens | {run['tokens_cached']} |
| cost_usd | {run['cost_usd']} |
| exa_searches | 0 |
| exa_fetches | 0 |
| word_count | {run['word_count']} |
"""
    return f"{fm}\n\n{body}\n{footer}"


def export_metrics_csv(con: sqlite3.Connection, path: Path) -> None:
    cur = con.execute(
        """SELECT changelog_date, started_at, completed_at, duration_sec,
                  agent_name, agent_runtime, tokens_input, tokens_output,
                  tokens_cached, cost_usd, exa_searches, exa_fetches,
                  word_count, notes
           FROM run_metrics ORDER BY changelog_date"""
    )
    rows = cur.fetchall()
    headers = [d[0] for d in cur.description]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def enrich() -> None:
    if not DB_PATH.exists():
        print(f"missing seeded db at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    staged: list[tuple[Path, Path]] = []
    try:
        con.execute("PRAGMA foreign_keys = ON;")
        con.execute("BEGIN;")

        for run in RUNS:
            con.execute(
                """INSERT INTO changelogs (date, title, path, summary,
                                           new_models_json, changed_json)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    run["date"],
                    run["title"],
                    f"changelogs/{run['date']}.md",
                    run["summary"],
                    "[]",
                    json.dumps(run["changed"]),
                ),
            )
            con.execute(
                """INSERT INTO run_metrics (changelog_date, started_at, completed_at,
                    duration_sec, agent_name, agent_runtime, tokens_input, tokens_output,
                    tokens_cached, cost_usd, exa_searches, exa_fetches, word_count, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)""",
                (
                    run["date"],
                    run["started_at"],
                    run["completed_at"],
                    run["duration_sec"],
                    run["agent_name"],
                    run["agent_runtime"],
                    run["tokens_input"],
                    run["tokens_output"],
                    run["tokens_cached"],
                    run["cost_usd"],
                    run["word_count"],
                    f"E2E enrichment — {run['title']}",
                ),
            )
            md_path = CHANGELOGS_DIR / f"{run['date']}.md"
            staged_path = md_path.with_suffix(".md.tmp")
            staged_path.write_text(render_changelog_md(run), encoding="utf-8")
            staged.append((staged_path, md_path))

        for name in SCORE_HISTORY_MODELS:
            row = con.execute(
                """SELECT m.id, s.intelligence, s.coding, s.agents, s.speed, s.cost, s.source_notes
                   FROM models m
                   JOIN model_scores s ON s.model_id = m.id AND s.as_of = (
                     SELECT as_of FROM model_scores WHERE model_id = m.id ORDER BY as_of LIMIT 1
                   )
                   WHERE m.name = ?""",
                (name,),
            ).fetchone()
            if not row:
                raise RuntimeError(f"seed model not found: {name}")
            delta = SCORE_DELTAS[name]
            con.execute(
                """INSERT INTO model_scores (model_id, as_of, intelligence, coding,
                                             agents, speed, cost, source_notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    row["id"],
                    SCORE_AS_OF,
                    round(row["intelligence"] + delta["intelligence"], 1),
                    round(row["coding"] + delta["coding"], 1),
                    round(row["agents"] + delta["agents"], 1),
                    round(row["speed"] + delta["speed"], 1),
                    round(row["cost"] + delta["cost"], 1),
                    row["source_notes"],
                ),
            )
            con.execute(
                "UPDATE models SET last_seen = ? WHERE id = ?",
                (SCORE_AS_OF, row["id"]),
            )

        permalink_id = con.execute(
            "SELECT id FROM models WHERE name = ?", (PERMALINK_MODEL_NAME,)
        ).fetchone()
        if not permalink_id:
            raise RuntimeError(f"permalink model missing: {PERMALINK_MODEL_NAME}")

        con.execute(
            "UPDATE meta SET value = ? WHERE key = 'last_updated'",
            (RUNS[-1]["completed_at"],),
        )

        manifest = {
            "permalink_model_id": permalink_id["id"],
            "permalink_model_name": PERMALINK_MODEL_NAME,
            "score_history_models": list(SCORE_HISTORY_MODELS),
            "run_dates": [r["date"] for r in RUNS],
        }
        manifest_path = DATA_DIR.parent / "seed-manifest.json"
        staged_manifest = manifest_path.with_suffix(".json.tmp")
        staged_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        staged.append((staged_manifest, manifest_path))

        staged_csv = CSV_PATH.with_suffix(".csv.tmp")
        export_metrics_csv(con, staged_csv)
        staged.append((staged_csv, CSV_PATH))

        con.execute("COMMIT;")
        for staged_path, final_path in staged:
            os.replace(staged_path, final_path)
    except Exception:
        if con.in_transaction:
            con.execute("ROLLBACK;")
        for staged_path, _ in staged:
            staged_path.unlink(missing_ok=True)
        raise
    finally:
        con.close()

    print(f"enriched {DB_PATH.name}: +{len(RUNS)} run_metrics, +{len(SCORE_HISTORY_MODELS)} score snapshots")


if __name__ == "__main__":
    enrich()
