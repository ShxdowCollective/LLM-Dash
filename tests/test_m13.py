"""M13 coverage: schema v4 migration, capability validation, scoped resets."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

import scripts.init_db as init_db
import scripts.reset_local_state as rls
from scripts.migrate_model_metadata_v4 import migrate as migrate_v4
from scripts.run_update import canonical_capabilities as ru_caps, RunUpdateError


# --- helpers --------------------------------------------------------------

def _seed(tmp_path: Path) -> Path:
    """Seed a throwaway DB by pointing init_db at tmp paths."""
    db = tmp_path / "dash.sqlite"
    init_db.DB_PATH = db
    init_db.CSV_PATH = tmp_path / "run_metrics.csv"
    init_db.CHANGELOGS_DIR = tmp_path / "changelogs"
    init_db.seed(force=True)
    return db


def _counts(db: Path) -> dict:
    c = sqlite3.connect(db)
    try:
        return {
            "models": c.execute("SELECT COUNT(*) FROM models").fetchone()[0],
            "scores": c.execute("SELECT COUNT(*) FROM model_scores").fetchone()[0],
            "changelogs": c.execute("SELECT COUNT(*) FROM changelogs").fetchone()[0],
            "run_metrics": c.execute("SELECT COUNT(*) FROM run_metrics").fetchone()[0],
            "last_updated": c.execute("SELECT value FROM meta WHERE key='last_updated'").fetchone()[0],
        }
    finally:
        c.close()


def _point_rls(tmp_path: Path, db: Path) -> None:
    rls.DB_PATH = db
    rls.CSV_PATH = tmp_path / "run_metrics.csv"
    rls.CHANGELOGS_DIR = tmp_path / "changelogs"
    rls.LOGS_DIR = tmp_path / "logs"
    rls.LOGS_DIR.mkdir(exist_ok=True)


# --- schema / seed --------------------------------------------------------

def test_seed_is_schema_v4_with_new_columns(tmp_path):
    db = _seed(tmp_path)
    c = sqlite3.connect(db)
    cols = {r[1] for r in c.execute("PRAGMA table_info(models)")}
    view_cols = {r[1] for r in c.execute("PRAGMA table_info(v_models_latest)")}
    ver = c.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]
    c.close()
    assert {"input_capabilities", "deprecated_on"} <= cols
    assert {"input_capabilities", "deprecated_on"} <= view_cols
    assert ver == "4"


def test_seed_multimodal_capabilities(tmp_path):
    db = _seed(tmp_path)
    c = sqlite3.connect(db)
    omni = c.execute("SELECT input_capabilities FROM models WHERE name='MiMo-V2-Omni'").fetchone()[0]
    default = c.execute("SELECT input_capabilities FROM models WHERE name='GPT-5.4'").fetchone()[0]
    c.close()
    assert json.loads(omni) == ["text", "image", "audio", "video"]
    assert json.loads(default) == ["text"]


def test_migration_idempotent(tmp_path):
    db = _seed(tmp_path)
    # Force version back to 3 and drop columns is hard in sqlite; instead run the
    # migration again — it must be a no-op and not raise.
    assert migrate_v4(db) is False
    # Simulate a v3 DB: rewrite meta and confirm a re-run still succeeds idempotently.
    c = sqlite3.connect(db)
    c.execute("UPDATE meta SET value='3' WHERE key='schema_version'")
    c.commit(); c.close()
    assert migrate_v4(db) is True  # columns exist but version < 4 -> bumps
    assert migrate_v4(db) is False


# --- capability validation ------------------------------------------------

def test_canonical_capabilities_orders_and_dedupes():
    assert ru_caps(["image", "text", "image"]) == json.dumps(["text", "image"])
    assert ru_caps(["audio"]) == json.dumps(["text", "audio"])
    assert ru_caps(None) is None
    assert ru_caps("") is None


def test_canonical_capabilities_rejects_unknown():
    with pytest.raises(RunUpdateError):
        ru_caps(["text", "smell"])


def test_init_db_canonical_defaults_text():
    assert json.loads(init_db.canonical_capabilities(None)) == ["text"]
    assert json.loads(init_db.canonical_capabilities(["video", "text"])) == ["text", "video"]


# --- scoped resets --------------------------------------------------------

def test_reset_stats_preserves_models_and_freshness(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    rls.reset_stats()
    after = _counts(db)
    assert after["run_metrics"] == 0
    assert after["models"] == 34
    assert after["changelogs"] == 1
    assert after["last_updated"] == "2026-04-20T00:00:00Z"


def test_reset_changelog_clears_history_and_metrics(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    assert list(rls.CHANGELOGS_DIR.glob("*.md"))  # seed wrote one
    rls.reset_changelog()
    after = _counts(db)
    assert after["changelogs"] == 0
    assert after["run_metrics"] == 0
    assert after["models"] == 34
    assert after["last_updated"] == "2026-04-20T00:00:00Z"
    assert not list(rls.CHANGELOGS_DIR.glob("*.md"))


def test_reset_models_reseeds(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    c = sqlite3.connect(db); c.execute("DELETE FROM model_scores"); c.execute("DELETE FROM models"); c.commit(); c.close()
    out = rls.reset_models()
    after = _counts(db)
    assert out["reseeded"] == 34
    assert after["models"] == 34
    assert after["scores"] == 34


def test_reset_tokens_table_matches_scopes():
    assert rls.RESET_TOKENS == {"stats": "STATS", "changelog": "CHANGELOG", "models": "MODELS", "full": "RESET"}
