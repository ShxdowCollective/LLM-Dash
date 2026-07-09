#!/usr/bin/env python3
"""Run an LLM-Dash update through the configured Agent Provider."""

from __future__ import annotations

import argparse
import asyncio
import csv
import datetime as dt
import json
import os
import re
import shutil
import sqlite3
import sys
import time
import traceback
from pathlib import Path
from typing import Any

try:
    from scripts.config import (
        AA_BASE_URL,
        LLMSTATS_BASE_URL,
        ConfigError,
        build_auth_headers,
        guard_ssrf,
        load_aa_api_key,
        load_exa_api_key,
        load_llmstats_api_key,
        load_provider_bundle,
        provider_api_base,
        redact_headers,
        redact_value,
    )
    from scripts.migrate_score_checks import migrate as migrate_score_checks
    from scripts.migrate_model_metadata_v4 import migrate as migrate_metadata_v4
except ModuleNotFoundError:
    from config import (  # type: ignore
        AA_BASE_URL,
        LLMSTATS_BASE_URL,
        ConfigError,
        build_auth_headers,
        guard_ssrf,
        load_aa_api_key,
        load_exa_api_key,
        load_llmstats_api_key,
        load_provider_bundle,
        provider_api_base,
        redact_headers,
        redact_value,
    )
    from migrate_score_checks import migrate as migrate_score_checks  # type: ignore
    from migrate_model_metadata_v4 import migrate as migrate_metadata_v4  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
CAPABILITY_VOCAB = ("text", "image", "audio", "video")
DATA_DIR = Path(os.environ.get("LLM_DASH_DATA_DIR") or (ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "dash.sqlite"
SKILL_PATH = ROOT / "skill" / "SKILL.md"
CHANGELOGS_DIR = Path(os.environ.get("LLM_DASH_CHANGELOGS_DIR") or (ROOT / "changelogs")).resolve()
CSV_PATH = DATA_DIR / "run_metrics.csv"
LOGS_DIR = ROOT / "logs"
AGENT_RUNTIME = "openai-agents"
EXA_MCP_URL = "https://mcp.exa.ai/mcp"
MAX_AGENT_TURNS = 50
LLMSTATS_ENRICHMENT_MAX_CHARS = 8000
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
AA_INDEX_FIELDS = {
    "intelligence": "artificial_analysis_intelligence_index",
    "coding": "artificial_analysis_coding_index",
    "agentic": "artificial_analysis_agentic_index",
}
METRICS_COLUMNS = [
    "changelog_date",
    "started_at",
    "completed_at",
    "duration_sec",
    "agent_name",
    "agent_runtime",
    "tokens_input",
    "tokens_output",
    "tokens_cached",
    "cost_usd",
    "exa_searches",
    "exa_fetches",
    "word_count",
    "notes",
]


class RunUpdateError(RuntimeError):
    pass


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_z(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def local_date() -> str:
    return dt.datetime.now().astimezone().date().isoformat()


def default_log_path() -> Path:
    stamp = utc_now().strftime("%Y%m%d-%H%M%S")
    return LOGS_DIR / f"run-update-{stamp}.log"


def write_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(f"{iso_z(utc_now())} {message}\n")


def parse_json_output(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RunUpdateError(f"Agent output was not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise RunUpdateError("Agent output must be a JSON object")
    return data


def word_count(markdown_body: str) -> int:
    text = re.sub(r"```.*?```", " ", markdown_body, flags=re.DOTALL)
    text = re.sub(r"`[^`]+`", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    return len(re.findall(r"\b[\w'-]+\b", text))


def yaml_list(values: list[str]) -> str:
    return "[" + ", ".join(json.dumps(v) for v in values) + "]"


def build_frontmatter(update: dict[str, Any], generated_at: str, agent_name: str) -> str:
    new_models = [str(item.get("name")) for item in update.get("new_models", []) if item.get("name")]
    changes: list[dict[str, Any]] = []
    for item in update.get("score_updates", []) or []:
        if item.get("name") and item.get("field"):
            changes.append(
                {
                    "model": item.get("name"),
                    "field": item.get("field"),
                    "from": item.get("old"),
                    "to": item.get("new"),
                }
            )
    for item in update.get("status_changes", []) or []:
        if item.get("name"):
            changes.append(
                {
                    "model": item.get("name"),
                    "field": "status",
                    "from": item.get("from"),
                    "to": item.get("to"),
                }
            )

    lines = [
        "---",
        f"date: {update['date']}",
        f"generated_at: {generated_at}",
        f"agent: {agent_name}",
        f"agent_runtime: {AGENT_RUNTIME}",
        f"new_models: {yaml_list(new_models)}",
    ]
    if changes:
        lines.append("changes:")
        for change in changes:
            lines.append(
                "  - "
                + json.dumps(
                    {
                        "model": change["model"],
                        "field": change["field"],
                        "from": change.get("from"),
                        "to": change.get("to"),
                    },
                    ensure_ascii=False,
                )
            )
    else:
        lines.append("changes: []")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def _model_label(item: Any) -> str:
    if isinstance(item, dict):
        name = str(item.get("name") or item.get("model") or item.get("id") or "").strip()
        vendor = str(item.get("vendor") or "").strip()
        return f"{name} — {vendor}" if name and vendor else name
    return str(item or "").strip()


def default_changelog_body(update: dict[str, Any]) -> str:
    """Build a readable changelog body from the structured update when the agent
    didn't supply ``changelog_markdown`` (e.g. seed runs). Avoids the misleading
    "No model or score updates were found." line whenever models actually moved.
    """
    title = str(update.get("title") or update["date"])
    new_models = update.get("new_models") or []
    score_updates = update.get("score_updates") or []
    status_changes = update.get("status_changes") or []

    lines = [f"# Changelog - {title}", ""]
    summary = str(update.get("summary") or "").strip()
    if summary:
        lines += [summary, ""]

    if new_models:
        labels = [label for label in (_model_label(m) for m in new_models) if label]
        lines.append(f"## New models ({len(labels)})")
        lines.append("")
        lines += [f"- {label}" for label in labels]
        lines.append("")

    if score_updates:
        lines.append(f"## Score updates ({len(score_updates)})")
        lines.append("")
        for item in score_updates:
            name = str(item.get("name") or "").strip() if isinstance(item, dict) else ""
            field = str(item.get("field") or "").strip() if isinstance(item, dict) else ""
            old = item.get("old") if isinstance(item, dict) else None
            new = item.get("new") if isinstance(item, dict) else None
            if name and field:
                lines.append(f"- {name}: {field} {old} → {new}")
        lines.append("")

    if status_changes:
        lines.append(f"## Status changes ({len(status_changes)})")
        lines.append("")
        for item in status_changes:
            name = str(item.get("name") or "").strip() if isinstance(item, dict) else ""
            frm = item.get("from") if isinstance(item, dict) else None
            to = item.get("to") if isinstance(item, dict) else None
            if name:
                lines.append(f"- {name}: {frm} → {to}")
        lines.append("")

    if not (new_models or score_updates or status_changes):
        lines.append("No model or score updates were found.")

    return "\n".join(lines).rstrip()


def build_changelog(update: dict[str, Any], generated_at: str, agent_name: str, metrics: dict[str, Any]) -> str:
    body = str(update.get("changelog_markdown") or "").strip()
    if not body:
        body = default_changelog_body(update)
    body_words = word_count(body)
    metrics["word_count"] = body_words
    footer = "\n\n---\n\n## Run Metadata\n\n| metric | value |\n|---|---|\n"
    rows = {
        "agent": agent_name,
        "agent_runtime": AGENT_RUNTIME,
        "started_at": metrics.get("started_at"),
        "completed_at": metrics.get("completed_at"),
        "duration_sec": metrics.get("duration_sec"),
        "input_tokens": metrics.get("tokens_input"),
        "output_tokens": metrics.get("tokens_output"),
        "cached_tokens": metrics.get("tokens_cached"),
        "cost_usd": metrics.get("cost_usd"),
        "exa_searches": metrics.get("exa_searches", 0),
        "exa_fetches": metrics.get("exa_fetches", 0),
        "word_count": body_words,
    }
    for key, value in rows.items():
        footer += f"| {key} | {'' if value is None else value} |\n"
    return build_frontmatter(update, generated_at, agent_name) + body + footer


def coerce_score(value: Any, field: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise RunUpdateError(f"{field} must be numeric") from exc
    if not 0 <= number <= 10:
        raise RunUpdateError(f"{field} must be between 0 and 10")
    return number


def canonical_capabilities(value: Any) -> str | None:
    """Validate update-supplied input_capabilities as a sorted, unique subset of
    the fixed vocabulary. Returns canonical JSON text, or None when unspecified
    (so a run never wipes an existing value via COALESCE)."""
    if value in (None, ""):
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    items = [str(v).strip().lower() for v in (value or [])]
    bad = [c for c in items if c not in CAPABILITY_VOCAB]
    if bad:
        raise RunUpdateError(f"input_capabilities has unknown modality: {bad[0]}")
    ordered = [c for c in CAPABILITY_VOCAB if c in items]
    if "text" not in ordered:
        ordered = ["text"] + ordered
        ordered = [c for c in CAPABILITY_VOCAB if c in ordered]
    return json.dumps(ordered)


def latest_scores(con: sqlite3.Connection, model_name: str) -> dict[str, Any]:
    row = con.execute(
        """SELECT m.id, s.intelligence, s.coding, s.agents, s.speed, s.cost, s.source_notes
           FROM models m
           LEFT JOIN model_scores s ON s.id = (
             SELECT id FROM model_scores
             WHERE model_id = m.id
             ORDER BY as_of DESC, id DESC
             LIMIT 1
           )
           WHERE m.name = ?""",
        (model_name,),
    ).fetchone()
    if not row:
        raise RunUpdateError(f"Unknown model in score update: {model_name}")
    return {
        "model_id": row[0],
        "intelligence": row[1],
        "coding": row[2],
        "agents": row[3],
        "speed": row[4],
        "cost": row[5],
        "source_notes": row[6],
    }


def validate_update(update: dict[str, Any], db_path: Path) -> None:
    date_value = str(update.get("date") or local_date())
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_value):
        raise RunUpdateError("date must be YYYY-MM-DD")
    dt.date.fromisoformat(date_value)

    new_names = {str(item.get("name") or "").strip() for item in update.get("new_models", []) or []}
    new_names.discard("")
    for model in update.get("new_models", []) or []:
        name = str(model.get("name") or "").strip()
        if not name:
            raise RunUpdateError("new model missing name")
        for field in ("intelligence", "coding", "agents", "speed", "cost"):
            coerce_score(model.get(field), field)

    con = sqlite3.connect(db_path)
    try:
        known_names = {
            str(row[0])
            for row in con.execute("SELECT name FROM models")
        }
        valid_names = known_names | new_names
        for update_item in update.get("score_updates", []) or []:
            name = str(update_item.get("name") or "").strip()
            field = str(update_item.get("field") or "").strip()
            if name not in known_names:
                raise RunUpdateError(f"Unknown model in score update: {name}")
            if field not in {"intelligence", "coding", "agents", "speed", "cost"}:
                raise RunUpdateError(f"Invalid score field: {field}")
            coerce_score(update_item.get("new"), field)

        for item in update.get("status_changes", []) or []:
            name = str(item.get("name") or "").strip()
            status = str(item.get("to") or "").strip()
            if name not in valid_names:
                raise RunUpdateError(f"Unknown model in status change: {name}")
            if status not in {"active", "superseded", "deprecated"}:
                raise RunUpdateError(f"Invalid status: {status}")
    finally:
        con.close()


def export_metrics_csv(db_path: Path, csv_path: Path) -> None:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            """SELECT changelog_date, started_at, completed_at, duration_sec,
                      agent_name, agent_runtime, tokens_input, tokens_output,
                      tokens_cached, cost_usd, exa_searches, exa_fetches,
                      word_count, notes
               FROM run_metrics ORDER BY changelog_date"""
        ).fetchall()
    finally:
        con.close()
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(METRICS_COLUMNS)
        writer.writerows(rows)


def safe_rel_path(path: Path, root: Path = ROOT) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _atomic_db_replace(work_path: Path, target: Path) -> None:
    """Atomically publish ``work_path`` as ``target``. On POSIX ``os.replace`` is a
    rename, so an HTTP reader that already opened the old file keeps a complete
    snapshot and new opens see the new file whole — no torn read mid-refresh (C3).
    On Windows a reader (StaticFiles) may briefly hold the target open, so retry
    with backoff before giving up."""
    last_exc: Exception | None = None
    for attempt in range(20):
        try:
            os.replace(work_path, target)
            return
        except PermissionError as exc:  # Windows: target momentarily open for read
            last_exc = exc
            time.sleep(0.1 * (attempt + 1))
    raise RunUpdateError(f"Could not atomically publish {target.name}: {last_exc}")


def _sweep_stale_work_files(db_path: Path) -> None:
    for stale in db_path.parent.glob(db_path.name + ".writing-*"):
        try:
            stale.unlink()
        except OSError:
            pass


def apply_update(
    update: dict[str, Any],
    metrics: dict[str, Any],
    db_path: Path,
    log_path: Path,
    changelogs_dir: Path,
    csv_path: Path,
) -> None:
    update.setdefault("date", local_date())
    parsed_date = dt.date.fromisoformat(update["date"])
    update.setdefault("title", f"{parsed_date:%B} {parsed_date.day}, {parsed_date:%Y}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(update["date"])):
        raise RunUpdateError("date must be YYYY-MM-DD")

    generated_at = str(metrics["completed_at"])
    agent_name = str(metrics.get("agent_name") or "unknown")
    changelog_path = changelogs_dir / f"{update['date']}.md"
    rel_changelog = safe_rel_path(changelog_path)
    markdown = build_changelog(update, generated_at, agent_name, metrics)
    changed_json = json.dumps(
        {
            "score_updates": update.get("score_updates", []) or [],
            "status_changes": update.get("status_changes", []) or [],
        },
        ensure_ascii=False,
    )
    new_models_json = json.dumps(update.get("new_models", []) or [], ensure_ascii=False)

    # Build the whole update against a temp copy, then atomically replace the
    # served file after COMMIT so a browser fetch never grabs a half-written DB
    # (C3). Fall back to in-place writes only if the target does not exist yet.
    use_atomic = db_path.exists()
    if use_atomic:
        _sweep_stale_work_files(db_path)
        work_path = db_path.with_name(db_path.name + f".writing-{os.getpid()}")
        shutil.copy2(db_path, work_path)
    else:
        work_path = db_path

    con = sqlite3.connect(work_path)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("BEGIN")
        as_of = str(update["date"])

        for model in update.get("new_models", []) or []:
            name = str(model.get("name") or "").strip()
            if not name:
                raise RunUpdateError("new model missing name")
            con.execute(
                """INSERT INTO models (name, vendor, color, released, params, pricing, notes, card_url, input_capabilities, first_seen, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, '["text"]'), date('now'), date('now'))
                   ON CONFLICT(name) DO UPDATE SET
                     vendor = excluded.vendor,
                     color = excluded.color,
                     released = excluded.released,
                     params = excluded.params,
                     pricing = excluded.pricing,
                     notes = excluded.notes,
                     card_url = COALESCE(excluded.card_url, models.card_url),
                     input_capabilities = COALESCE(?, models.input_capabilities),
                     last_seen = date('now')""",
                (
                    name,
                    str(model.get("vendor") or "Unknown"),
                    str(model.get("color") or "#888888"),
                    str(model.get("released") or ""),
                    str(model.get("params") or ""),
                    str(model.get("pricing") or ""),
                    str(model.get("notes") or ""),
                    (str(model.get("card_url")).strip() or None) if model.get("card_url") else None,
                    canonical_capabilities(model.get("input_capabilities")),
                    canonical_capabilities(model.get("input_capabilities")),
                ),
            )
            con.execute(
                """INSERT INTO model_scores
                     (model_id, as_of, intelligence, coding, agents, speed, cost, source_notes)
                   SELECT id, ?, ?, ?, ?, ?, ?, ? FROM models WHERE name = ?
                   ON CONFLICT(model_id, as_of) DO UPDATE SET
                     intelligence = excluded.intelligence,
                     coding = excluded.coding,
                     agents = excluded.agents,
                     speed = excluded.speed,
                     cost = excluded.cost,
                     source_notes = excluded.source_notes""",
                (
                    as_of,
                    coerce_score(model.get("intelligence"), "intelligence"),
                    coerce_score(model.get("coding"), "coding"),
                    coerce_score(model.get("agents"), "agents"),
                    coerce_score(model.get("speed"), "speed"),
                    coerce_score(model.get("cost"), "cost"),
                    str(model.get("notes") or ""),
                    name,
                ),
            )

        for update_item in update.get("score_updates", []) or []:
            name = str(update_item.get("name") or "").strip()
            field = str(update_item.get("field") or "").strip()
            if field not in {"intelligence", "coding", "agents", "speed", "cost"}:
                raise RunUpdateError(f"Invalid score field: {field}")
            scores = latest_scores(con, name)
            scores[field] = coerce_score(update_item.get("new"), field)
            source = str(update_item.get("source_url") or "")
            notes = str(scores.get("source_notes") or "")
            if source and source not in notes:
                notes = (notes + "\n" if notes else "") + source
            con.execute(
                """INSERT INTO model_scores
                     (model_id, as_of, intelligence, coding, agents, speed, cost, source_notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(model_id, as_of) DO UPDATE SET
                     intelligence = excluded.intelligence,
                     coding = excluded.coding,
                     agents = excluded.agents,
                     speed = excluded.speed,
                     cost = excluded.cost,
                     source_notes = excluded.source_notes""",
                (
                    scores["model_id"],
                    as_of,
                    scores["intelligence"],
                    scores["coding"],
                    scores["agents"],
                    scores["speed"],
                    scores["cost"],
                    notes,
                ),
            )

        for item in update.get("status_changes", []) or []:
            status = str(item.get("to") or "").strip()
            name = str(item.get("name") or "").strip()
            if status not in {"active", "superseded", "deprecated"}:
                raise RunUpdateError(f"Invalid status: {status}")
            # Stamp deprecated_on when a model first goes deprecated; clear it
            # only when explicitly reactivated to active.
            if status == "deprecated":
                cur = con.execute(
                    "UPDATE models SET status = ?, "
                    "deprecated_on = COALESCE(deprecated_on, ?), last_seen = date('now') WHERE name = ?",
                    (status, as_of, name),
                )
            elif status == "active":
                cur = con.execute(
                    "UPDATE models SET status = ?, deprecated_on = NULL, last_seen = date('now') WHERE name = ?",
                    (status, name),
                )
            else:
                cur = con.execute(
                    "UPDATE models SET status = ?, last_seen = date('now') WHERE name = ?",
                    (status, name),
                )
            if cur.rowcount == 0:
                raise RunUpdateError(f"Status change references unknown model: {name}")

        con.execute(
            """INSERT INTO changelogs (date, title, path, summary, new_models_json, changed_json)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET
                 title = excluded.title,
                 path = excluded.path,
                 summary = excluded.summary,
                 new_models_json = excluded.new_models_json,
                 changed_json = excluded.changed_json""",
            (
                update["date"],
                str(update.get("title") or update["date"]),
                rel_changelog,
                str(update.get("summary") or ""),
                new_models_json,
                changed_json,
            ),
        )
        con.execute(
            """INSERT INTO run_metrics (
                 changelog_date, started_at, completed_at, duration_sec,
                 agent_name, agent_runtime, tokens_input, tokens_output, tokens_cached,
                 cost_usd, exa_searches, exa_fetches, word_count, notes
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(changelog_date) DO UPDATE SET
                 started_at = excluded.started_at,
                 completed_at = excluded.completed_at,
                 duration_sec = excluded.duration_sec,
                 agent_name = excluded.agent_name,
                 agent_runtime = excluded.agent_runtime,
                 tokens_input = excluded.tokens_input,
                 tokens_output = excluded.tokens_output,
                 tokens_cached = excluded.tokens_cached,
                 cost_usd = excluded.cost_usd,
                 exa_searches = excluded.exa_searches,
                 exa_fetches = excluded.exa_fetches,
                 word_count = excluded.word_count,
                 notes = excluded.notes""",
            (
                update["date"],
                metrics.get("started_at"),
                metrics.get("completed_at"),
                metrics.get("duration_sec"),
                agent_name,
                AGENT_RUNTIME,
                metrics.get("tokens_input"),
                metrics.get("tokens_output"),
                metrics.get("tokens_cached"),
                metrics.get("cost_usd"),
                metrics.get("exa_searches", 0),
                metrics.get("exa_fetches", 0),
                metrics.get("word_count"),
                metrics.get("notes") or f"Agent Provider update. Log: {safe_rel_path(log_path)}",
            ),
        )
        con.execute(
            """INSERT INTO meta (key, value) VALUES ('last_updated', ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
            (generated_at,),
        )
        con.commit()
    except Exception:
        con.rollback()
        con.close()
        if use_atomic:
            try:
                work_path.unlink()
            except OSError:
                pass
        raise
    else:
        con.close()
        if use_atomic:
            _atomic_db_replace(work_path, db_path)

    changelogs_dir.mkdir(parents=True, exist_ok=True)
    changelog_path.write_text(markdown, encoding="utf-8")
    export_metrics_csv(db_path, csv_path)


def current_state(db_path: Path) -> dict[str, Any]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        last_updated = con.execute("SELECT value FROM meta WHERE key = 'last_updated'").fetchone()
        models = con.execute("SELECT * FROM v_models_latest ORDER BY vendor, name").fetchall()
        changelogs = con.execute(
            """SELECT date, title, summary, new_models_json
               FROM changelogs ORDER BY date DESC LIMIT 5"""
        ).fetchall()
        return {
            "last_updated": last_updated["value"] if last_updated else None,
            "models": [dict(row) for row in models],
            "recent_changelogs": [dict(row) for row in changelogs],
        }
    finally:
        con.close()


def usage_metrics(result: Any) -> dict[str, Any]:
    totals = {"tokens_input": None, "tokens_output": None, "tokens_cached": None, "cost_usd": None}
    seen: set[int] = set()

    def add_usage(usage: Any) -> None:
        if not usage:
            return
        if isinstance(usage, dict):
            input_tokens = usage.get("input_tokens", usage.get("prompt_tokens"))
            output_tokens = usage.get("output_tokens", usage.get("completion_tokens"))
            cached_tokens = usage.get("cached_tokens")
            details = usage.get("prompt_tokens_details") or usage.get("input_tokens_details") or {}
            if cached_tokens is None and isinstance(details, dict):
                cached_tokens = details.get("cached_tokens")
        else:
            input_tokens = getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", None)
            output_tokens = getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", None)
            cached_tokens = getattr(usage, "cached_tokens", None)
            details = getattr(usage, "prompt_tokens_details", None) or getattr(usage, "input_tokens_details", None)
            if cached_tokens is None and details is not None:
                cached_tokens = getattr(details, "cached_tokens", None)
        for key, value in (
            ("tokens_input", input_tokens),
            ("tokens_output", output_tokens),
            ("tokens_cached", cached_tokens),
        ):
            if value is not None:
                totals[key] = (totals[key] or 0) + int(value)

    def walk(obj: Any, depth: int = 0) -> None:
        if obj is None or depth > 5:
            return
        obj_id = id(obj)
        if obj_id in seen:
            return
        seen.add(obj_id)
        if isinstance(obj, dict):
            if "usage" in obj:
                add_usage(obj["usage"])
            for key in ("raw_responses", "responses", "items", "data"):
                walk(obj.get(key), depth + 1)
        elif isinstance(obj, (list, tuple)):
            for item in obj:
                walk(item, depth + 1)
        else:
            if hasattr(obj, "usage"):
                add_usage(getattr(obj, "usage"))
            for key in ("raw_responses", "responses", "items", "data"):
                if hasattr(obj, key):
                    walk(getattr(obj, key), depth + 1)

    walk(result)
    return totals


def _summarize_tool_arg(raw_item: Any) -> str:
    """Pull a short, human-readable hint (query/url) out of a tool call's args."""
    args = getattr(raw_item, "arguments", None)
    if not isinstance(args, str) or not args:
        return ""
    try:
        data = json.loads(args)
    except Exception:
        return args.strip()[:80]
    if isinstance(data, dict):
        for key in ("query", "url", "urls", "question", "input", "text", "id", "ids"):
            value = data.get(key)
            if value:
                if isinstance(value, (list, tuple)):
                    value = ", ".join(str(v) for v in value)
                return str(value)[:80]
    return ""


def _classify_tool(name: str) -> str:
    low = name.lower()
    if "search" in low:
        return "search"
    if any(token in low for token in ("content", "crawl", "fetch", "get", "read", "page")):
        return "fetch"
    return "other"


async def _consume_agent_stream(result: Any, log_path: Path) -> dict[str, int]:
    """Drain a streamed agent run, logging tool activity so seed/refresh narrate
    the otherwise-opaque research phase. Per-event logging is defensive: a logging
    error must never kill a real run. MaxTurnsExceeded / MCP runtime errors are
    raised by the stream iterator itself (outside the try) so they still propagate
    to the caller's retry/fallback logic."""
    counts = {"calls": 0, "searches": 0, "fetches": 0}
    listed_tools = False
    async for event in result.stream_events():
        try:
            if getattr(event, "type", "") != "run_item_stream_event":
                continue
            name = getattr(event, "name", "")
            item = getattr(event, "item", None)
            if name == "tool_called":
                raw = getattr(item, "raw_item", None)
                tool_name = str(getattr(raw, "name", None) or getattr(item, "title", None) or "tool")
                kind = _classify_tool(tool_name)
                counts["calls"] += 1
                if kind == "search":
                    counts["searches"] += 1
                elif kind == "fetch":
                    counts["fetches"] += 1
                payload = {"n": counts["calls"], "kind": kind, "name": tool_name}
                arg = _summarize_tool_arg(raw)
                if arg:
                    payload["arg"] = arg
                write_log(log_path, "agent_tool_call " + json.dumps(payload, ensure_ascii=False))
            elif name == "mcp_list_tools" and not listed_tools:
                listed_tools = True
                write_log(log_path, "agent_research_tools ready=exa")
        except Exception as exc:  # noqa: BLE001 - logging must never abort a run
            write_log(log_path, f"agent_stream_log_error={type(exc).__name__}: {exc}")
    write_log(log_path, "agent_tool_summary " + json.dumps(counts))
    return counts


async def run_agent_once(model_name: str, prompt: str, exa_key: str, log_path: Path) -> tuple[str, dict[str, Any]]:
    from agents import Agent, AsyncOpenAI, MaxTurnsExceeded, OpenAIChatCompletionsModel, Runner, set_tracing_disabled

    write_log(log_path, "agent_run " + json.dumps({"model": model_name}))

    bundle = load_provider_bundle()
    set_tracing_disabled(disabled=True)
    client = AsyncOpenAI(
        api_key=bundle.secrets.api_key,
        base_url=provider_api_base(bundle.config.base_url, bundle.config.endpoint_mode),
        default_headers=bundle.config.request_headers or None,
    )
    model = OpenAIChatCompletionsModel(model=model_name, openai_client=client)

    can_use_exa = False
    try:
        from agents.mcp import MCPServerStreamableHttp
        can_use_exa = True
    except Exception as exc:
        write_log(log_path, f"exa_mcp_setup_error={type(exc).__name__}: {exc}")

    def make_agent(mcp_servers: list[Any] | None = None) -> Any:
        return Agent(
            name="LLM-Dash update agent",
            instructions=(
                "Follow the supplied SKILL.md contract for research and scoring. "
                "Return only valid JSON matching the requested diff schema. "
                "Do not write files or mutate the database yourself."
            ),
            model=model,
            mcp_servers=mcp_servers or [],
        )

    def make_exa_server() -> Any:
        params: dict[str, Any] = {"url": EXA_MCP_URL}
        if exa_key:
            params["headers"] = {"x-api-key": exa_key}
        return MCPServerStreamableHttp(
            name="exa",
            params=params,
            cache_tools_list=True,
            require_approval="never",
        )

    # Holds the tool-call counts from the attempt that ultimately succeeds. Each
    # attempt overwrites (not adds), so a retry/fallback never double-counts: a
    # failed attempt raises inside _consume_agent_stream before returning counts.
    agent_counts: dict[str, int] = {"calls": 0, "searches": 0, "fetches": 0}

    async def run_with_exa(max_turns: int) -> Any:
        async with make_exa_server() as server:
            agent = make_agent([server])
            result = Runner.run_streamed(agent, prompt, max_turns=max_turns)
            agent_counts.update(await _consume_agent_stream(result, log_path))
            return result

    async def run_without_exa(max_turns: int) -> Any:
        agent = make_agent()
        result = Runner.run_streamed(agent, prompt, max_turns=max_turns)
        agent_counts.update(await _consume_agent_stream(result, log_path))
        return result

    if can_use_exa and exa_key:
        try:
            result = await run_with_exa(MAX_AGENT_TURNS)
        except MaxTurnsExceeded as exc:
            write_log(log_path, f"exa_mcp_max_turns={exc}; retrying max_turns={MAX_AGENT_TURNS * 2}")
            try:
                result = await run_with_exa(MAX_AGENT_TURNS * 2)
            except MaxTurnsExceeded as retry_exc:
                write_log(log_path, f"exa_mcp_max_turns_retry_failed={retry_exc}; falling back without Exa")
                result = await run_without_exa(MAX_AGENT_TURNS)
            except Exception as retry_exc:
                write_log(log_path, f"exa_mcp_retry_runtime_error={type(retry_exc).__name__}: {retry_exc}; falling back without Exa")
                result = await run_without_exa(MAX_AGENT_TURNS)
        except Exception as exc:
            write_log(log_path, f"exa_mcp_runtime_error={type(exc).__name__}: {exc}")
            result = await run_without_exa(MAX_AGENT_TURNS)
    else:
        result = await run_without_exa(MAX_AGENT_TURNS)

    usage = usage_metrics(result)
    usage["exa_searches"] = agent_counts.get("searches", 0)
    usage["exa_fetches"] = agent_counts.get("fetches", 0)
    return str(result.final_output), usage


def fetch_llmstats_enrichment(api_key: str, since_date: str | None, log_path: Path) -> str | None:
    import httpx

    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    results: dict[str, Any] = {}
    try:
        with httpx.Client(timeout=15) as client:
            days = 7
            if since_date:
                try:
                    delta = (dt.date.today() - dt.date.fromisoformat(since_date[:10])).days
                    days = max(1, min(delta + 1, 30))
                except ValueError:
                    pass
            resp = client.get(f"{LLMSTATS_BASE_URL}/v1/updates", headers=headers, params={"days": str(days)})
            if resp.status_code == 200:
                results["updates"] = resp.json()

            resp = client.get(f"{LLMSTATS_BASE_URL}/v1/models", headers=headers, params={"limit": "50"})
            if resp.status_code == 200:
                results["models_catalog"] = resp.json()
    except Exception as exc:
        write_log(log_path, f"llmstats_enrichment_error={type(exc).__name__}: {exc}")
        return None

    if not results:
        write_log(log_path, "llmstats_enrichment_empty")
        return None

    text = json.dumps(results, ensure_ascii=False)
    if len(text) > LLMSTATS_ENRICHMENT_MAX_CHARS:
        text = text[:LLMSTATS_ENRICHMENT_MAX_CHARS] + "…(truncated)"
    write_log(log_path, f"llmstats_enrichment_ok chars={len(text)}")
    return text


def read_custom_endpoint_bearer(credential_name: str) -> str:
    try:
        from scripts import voidware_auth
    except ModuleNotFoundError:
        import voidware_auth  # type: ignore

    name = str(credential_name or "").strip()
    if not name:
        # No purpose-scoped credential -> no Authorization header. Never fall back
        # to the live provider key on a user-supplied endpoint, and never swallow
        # a named-credential read failure (S3).
        return ""
    return str(voidware_auth.read_secret_with_grant(name).get("secret") or "")


def fetch_refresh_candidates(args: argparse.Namespace, log_path: Path) -> list[dict[str, Any]]:
    preset = args.source_preset
    count = max(1, min(int(args.source_count or 25), 100))
    if preset in {"exa", "custom-prompt"}:
        return []

    import httpx

    if preset == "llmstats":
        key = load_llmstats_api_key()
        if not key:
            write_log(log_path, "refresh_source_error preset=llmstats error=missing_key")
            return []
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{LLMSTATS_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
                params={"limit": str(count)},
            )
        if response.status_code != 200:
            write_log(log_path, f"refresh_source_error preset=llmstats status={response.status_code}")
            return []
        data = response.json()
        items = data.get("data") or data.get("models") or [] if isinstance(data, dict) else data
        if not isinstance(items, list):
            return []
        return [
            {"name": item.get("name") or item.get("id") or item.get("slug"), "source": "https://llm-stats.com/"}
            for item in items[:count]
            if isinstance(item, dict) and (item.get("name") or item.get("id") or item.get("slug"))
        ]

    if preset == "aa":
        key = load_aa_api_key()
        if not key:
            write_log(log_path, "refresh_source_error preset=aa error=missing_key")
            return []
        field = AA_INDEX_FIELDS.get(args.source_index or "intelligence", AA_INDEX_FIELDS["intelligence"])
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{AA_BASE_URL}/language/models/free",
                headers={"x-api-key": key, "Accept": "application/json"},
            )
        if response.status_code != 200:
            write_log(log_path, f"refresh_source_error preset=aa status={response.status_code}")
            return []
        payload = response.json()
        models = payload if isinstance(payload, list) else payload.get("data") or payload.get("models") or []
        if not isinstance(models, list):
            return []

        def sort_key(item: dict[str, Any]) -> float:
            try:
                return float(item.get(field) or 0)
            except (TypeError, ValueError):
                return 0.0

        ranked = sorted((m for m in models if isinstance(m, dict)), key=sort_key, reverse=True)[:count]
        return [
            {
                "name": item.get("name") or item.get("slug"),
                "vendor": (item.get("model_creator") or {}).get("name") if isinstance(item.get("model_creator"), dict) else "",
                "source": "https://artificialanalysis.ai/",
            }
            for item in ranked
            if item.get("name") or item.get("slug")
        ]

    if preset == "openrouter":
        with httpx.Client(timeout=30) as client:
            response = client.get(OPENROUTER_MODELS_URL, headers={"Accept": "application/json"})
        if response.status_code != 200:
            write_log(log_path, f"refresh_source_error preset=openrouter status={response.status_code}")
            return []
        data = response.json()
        items = data.get("data") or [] if isinstance(data, dict) else []
        if not isinstance(items, list):
            return []

        def sort_key(item: dict[str, Any]) -> tuple[int, str]:
            ctx = item.get("context_length") or item.get("top_provider", {}).get("context_length") or 0
            try:
                ctx_val = int(ctx)
            except (TypeError, ValueError):
                ctx_val = 0
            return (ctx_val, str(item.get("created") or ""))

        ranked = sorted((m for m in items if isinstance(m, dict)), key=sort_key, reverse=True)[:count]
        return [{"name": item.get("id") or item.get("name"), "source": "https://openrouter.ai/models"} for item in ranked if item.get("id") or item.get("name")]

    if preset == "custom-endpoint" and args.source_endpoint:
        guard_ssrf(args.source_endpoint, field="source_endpoint")
        bearer = read_custom_endpoint_bearer(args.source_credential)
        headers = {"Accept": "application/json"}
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        url = args.source_endpoint if args.source_endpoint.endswith("/models") else args.source_endpoint.rstrip("/") + "/models"
        with httpx.Client(timeout=30) as client:
            response = client.get(url, headers=headers)
        if response.status_code != 200:
            write_log(log_path, f"refresh_source_error preset=custom-endpoint status={response.status_code}")
            return []
        data = response.json()
        items = data.get("data") or [] if isinstance(data, dict) else []
        if not isinstance(items, list):
            return []
        return [{"name": item.get("id") or item.get("name"), "source": url} for item in items[:count] if isinstance(item, dict) and (item.get("id") or item.get("name"))]

    return []


async def generate_diff(log_path: Path, db_path: Path = DB_PATH, args: argparse.Namespace | None = None) -> tuple[dict[str, Any], dict[str, Any], str, bool]:
    bundle = load_provider_bundle()
    if not bundle.has_provider:
        raise ConfigError("Agent Provider requires base_url, api_key, and default_model")
    if args is None:
        args = argparse.Namespace(source_preset="exa", source_count=25, source_index="", source_prompt="", source_endpoint="", source_credential="")
    state = current_state(db_path)
    write_log(log_path, f"refresh_state_loaded models={len(state.get('models') or [])}")
    skill = SKILL_PATH.read_text(encoding="utf-8")
    exa_key = load_exa_api_key()
    llmstats_key = load_llmstats_api_key()

    prompt_parts = [
        "Produce today's LLM-Dash update diff as JSON only.",
        f"Today: {local_date()}",
        "Current dashboard state JSON:",
        json.dumps(state, ensure_ascii=False),
        "SKILL.md contract:",
        skill,
        "Required JSON keys: date, title, summary, new_models, score_updates, status_changes, changelog_markdown.",
    ]

    write_log(log_path, f"refresh_source preset={args.source_preset} count={args.source_count}")
    source_candidates = fetch_refresh_candidates(args, log_path)
    if source_candidates:
        write_log(log_path, f"refresh_source_candidates resolved={len(source_candidates)}")
        prompt_parts.append(
            "Refresh source candidate models. Prioritize checking these candidates for new models, score changes, and status changes:"
        )
        prompt_parts.append(json.dumps(source_candidates, ensure_ascii=False, indent=2))
    elif args.source_preset == "custom-prompt" and args.source_prompt:
        prompt_parts.append("Refresh discovery brief:")
        prompt_parts.append(args.source_prompt)
    elif args.source_preset == "exa":
        prompt_parts.append(
            f"Refresh source: Exa web research. Discover up to {args.source_count} current model changes from primary sources."
        )

    llmstats_enriched = False
    if llmstats_key:
        enrichment = fetch_llmstats_enrichment(llmstats_key, state.get("last_updated"), log_path)
        if enrichment:
            llmstats_enriched = True
            prompt_parts.append(
                "LLM Stats enrichment data (supplementary context — prefer primary sources for final scoring):"
            )
            prompt_parts.append(enrichment)

    prompt = "\n\n".join(prompt_parts)

    errors: list[str] = []
    for model_name in [bundle.config.default_model, bundle.config.backup_model]:
        if not model_name:
            continue
        try:
            write_log(
                log_path,
                "agent_start "
                + json.dumps(
                    {
                        "model": model_name,
                        "base_url": bundle.config.base_url,
                        "endpoint_mode": bundle.config.endpoint_mode,
                        "headers": redact_headers(bundle.config.request_headers),
                        "exa_mcp": True,
                        "exa_auth": "key" if exa_key else "free",
                        "llmstats_enriched": llmstats_enriched,
                    }
                ),
            )
            output, usage = await run_agent_once(model_name, prompt, exa_key, log_path)
            update = parse_json_output(output)
            validate_update(update, db_path)
            write_log(
                log_path,
                "refresh_diff "
                + json.dumps(
                    {
                        "new_models": len(update.get("new_models") or []),
                        "score_updates": len(update.get("score_updates") or []),
                        "status_changes": len(update.get("status_changes") or []),
                    }
                ),
            )
            return update, usage, model_name, llmstats_enriched
        except Exception as exc:
            errors.append(f"{model_name}: {type(exc).__name__}: {exc}")
            write_log(log_path, f"agent_error model={model_name} error={type(exc).__name__}: {exc}")
    raise RunUpdateError("All configured models failed: " + " | ".join(errors))


def dry_run(log_path: Path) -> None:
    bundle = load_provider_bundle()
    if not bundle.has_provider:
        raise ConfigError("Agent Provider requires base_url, api_key, and default_model")
    try:
        import agents  # noqa: F401
    except Exception as exc:
        raise RunUpdateError(f"openai-agents import failed: {exc}") from exc
    safe = {
        "base_url": bundle.config.base_url,
        "chat_endpoint": bundle.chat_endpoint,
        "models_endpoint": bundle.models_endpoint,
        "endpoint_mode": bundle.config.endpoint_mode,
        "default_model": bundle.config.default_model,
        "backup_model": bundle.config.backup_model,
        "provider_key": redact_value(bundle.secrets.api_key),
        "headers": redact_headers(build_auth_headers(bundle)),
        "exa_configured": bool(load_exa_api_key()),
        "llmstats_configured": bool(load_llmstats_api_key()),
    }
    write_log(log_path, "dry_run " + json.dumps(safe))
    print(json.dumps({"ok": True, **safe}, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="validate config without DB writes")
    parser.add_argument("--db-path", default=str(DB_PATH), help="SQLite database path")
    parser.add_argument("--log-path", default="", help="log file path")
    parser.add_argument("--diff-json", default="", help="apply an existing diff JSON file instead of calling the model")
    parser.add_argument("--source-preset", default="exa", choices=("aa", "llmstats", "exa", "openrouter", "custom-prompt", "custom-endpoint"))
    parser.add_argument("--source-count", type=int, default=25)
    parser.add_argument("--source-index", default="intelligence")
    parser.add_argument("--source-prompt", default="")
    parser.add_argument("--source-endpoint", default="")
    parser.add_argument("--source-credential", default="")
    args = parser.parse_args()

    log_path = Path(args.log_path) if args.log_path else default_log_path()
    db_path = Path(args.db_path)
    changelogs_dir = CHANGELOGS_DIR if db_path.resolve() == DB_PATH.resolve() else db_path.parent / "changelogs"
    csv_path = CSV_PATH if db_path.resolve() == DB_PATH.resolve() else db_path.parent / "run_metrics.csv"
    started = utc_now()
    start_time = time.monotonic()
    write_log(log_path, "run_start")
    try:
        if args.dry_run:
            dry_run(log_path)
            write_log(log_path, "run_complete dry_run=true")
            return 0

        if not db_path.exists():
            raise RunUpdateError(f"Missing database: {db_path}")
        if migrate_score_checks(db_path):
            write_log(log_path, "score_check_migration_applied")
        if migrate_metadata_v4(db_path):
            write_log(log_path, "metadata_v4_migration_applied")

        enriched = False
        if args.diff_json:
            update = json.loads(Path(args.diff_json).read_text(encoding="utf-8"))
            validate_update(update, db_path)
            usage = {"tokens_input": None, "tokens_output": None, "tokens_cached": None, "cost_usd": None}
            agent_name = "diff-json"
        else:
            update, usage, agent_name, enriched = asyncio.run(generate_diff(log_path, db_path, args))

        completed = utc_now()
        notes_parts = [f"Agent Provider update. Log: {safe_rel_path(log_path)}"]
        if enriched:
            notes_parts.append("llmstats_enriched=true")
        metrics = {
            "started_at": iso_z(started),
            "completed_at": iso_z(completed),
            "duration_sec": round(time.monotonic() - start_time, 3),
            "agent_name": agent_name,
            "exa_searches": 0,
            "exa_fetches": 0,
            "notes": " ".join(notes_parts),
            **usage,
        }
        diff_counts = {
            "new_models": len(update.get("new_models") or []),
            "score_updates": len(update.get("score_updates") or []),
            "status_changes": len(update.get("status_changes") or []),
        }
        write_log(log_path, "refresh_apply " + json.dumps(diff_counts))
        apply_update(update, metrics, db_path, log_path, changelogs_dir, csv_path)
        write_log(log_path, "run_complete " + json.dumps(diff_counts))
        print(json.dumps({"ok": True, "date": update.get("date"), "log_path": str(log_path)}, indent=2))
        return 0
    except (ConfigError, RunUpdateError, sqlite3.Error, json.JSONDecodeError) as exc:
        write_log(log_path, f"run_error {type(exc).__name__}: {exc}")
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        write_log(log_path, "run_error " + traceback.format_exc().replace("\n", " | "))
        print(f"error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
