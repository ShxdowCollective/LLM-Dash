"""M13 coverage: schema v4 migration, capability validation, scoped resets."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import scripts.init_db as init_db
import scripts.reset_local_state as rls
import server
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
    documented = c.execute("SELECT input_capabilities FROM models WHERE name='GPT-5.4'").fetchone()[0]
    default = c.execute("SELECT input_capabilities FROM models WHERE name='MiniMax M2.5'").fetchone()[0]
    c.close()
    assert json.loads(omni) == ["text", "image", "audio", "video"]
    assert json.loads(documented) == ["text", "image"]
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


def test_reset_full_invokes_grant_cleanup(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    grant_summary = {"revoked": ["grant-1"], "removed_cache": ["legacy-grant-cache:abc"], "warnings": []}
    with patch("scripts.reset_local_state.clear_llmdash_grants", return_value=grant_summary) as clear:
        out = rls.reset_full()
    clear.assert_called_once_with(dry_run=False, secret_names=[])
    assert "grants: revoked 1 LLM-Dash grant(s)" in out["removed_files"]
    assert "legacy-grant-cache:abc" in out["removed_files"]


def test_partial_reset_does_not_clear_grants(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    with patch("scripts.reset_local_state.clear_llmdash_grants") as clear:
        rls.reset_stats()
    clear.assert_not_called()


def test_reset_local_state_dry_run_previews_grant_cleanup(tmp_path, monkeypatch):
    monkeypatch.setattr(rls, "SCHEDULE_PATH", tmp_path / "schedule.json")
    monkeypatch.setattr(rls, "config_path", lambda: tmp_path / "config.json")
    monkeypatch.setattr(rls, "DB_PATH", tmp_path / "dash.sqlite")
    monkeypatch.setattr(rls, "CSV_PATH", tmp_path / "run_metrics.csv")
    monkeypatch.setattr(rls, "LOGS_DIR", tmp_path / "logs")
    grant_summary = {"revoked": ["grant-preview"], "removed_cache": [], "warnings": ["grant cleanup preview: would revoke 1 LLM-Dash grant(s)"]}
    with patch("scripts.reset_local_state.clear_llmdash_grants", return_value=grant_summary) as clear:
        removed, warnings = rls.reset_local_state(dry_run=True)
    clear.assert_called_once_with(dry_run=True, secret_names=[])
    assert any("grants: would revoke" in item for item in removed)
    assert any("grant cleanup preview" in item for item in warnings)


def test_api_reset_rejects_wrong_token(tmp_path):
    db = _seed(tmp_path)
    server.DB_PATH = db
    client = TestClient(server.app)
    resp = client.post("/api/reset", json={"scope": "stats", "confirm_token": "NOPE"})
    assert resp.status_code == 400


def test_api_reset_accepts_correct_token(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    server.DB_PATH = db
    client = TestClient(server.app)
    with patch("scripts.reset_local_state.clear_llmdash_grants", return_value={"revoked": [], "removed_cache": [], "warnings": []}):
        resp = client.post("/api/reset", json={"scope": "stats", "confirm_token": "STATS"})
    assert resp.status_code == 200
    assert resp.json()["scope"] == "stats"


def test_api_reset_blocks_active_update_job(tmp_path):
    db = _seed(tmp_path)
    server.DB_PATH = db
    client = TestClient(server.app)
    with server._jobs_lock:
        server._jobs.clear()
        server._jobs["job-1"] = {"id": "job-1", "state": "running"}
    try:
        resp = client.post("/api/reset", json={"scope": "stats", "confirm_token": "STATS"})
        assert resp.status_code == 409
    finally:
        with server._jobs_lock:
            server._jobs.clear()


def test_api_full_reset_includes_grant_cleanup_warnings(tmp_path):
    db = _seed(tmp_path)
    _point_rls(tmp_path, db)
    server.DB_PATH = db
    client = TestClient(server.app)
    grant_summary = {"revoked": [], "removed_cache": [], "warnings": ["grant cleanup skipped: broker unavailable"]}
    with patch("scripts.reset_local_state.clear_llmdash_grants", return_value=grant_summary):
        resp = client.post("/api/reset", json={"scope": "full", "confirm_token": "RESET"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope"] == "full"
    assert any("broker unavailable" in item for item in body.get("warnings", []))


def test_api_external_credential_mutation_returns_403(tmp_path):
    from scripts.config import ConfigError

    db = _seed(tmp_path)
    server.DB_PATH = db
    client = TestClient(server.app)
    rejection = ConfigError(
        "This credential is not managed by LLM-Dash. External mutation requires "
        "external_mutation=true and require_fresh_grant=true."
    )
    with patch("server.update_slot_api_key", side_effect=rejection):
        resp = client.post("/api/credentials/slots/exa/update", json={"api_key": "sk-x"})
    assert resp.status_code == 403
    with patch("server.delete_slot_credential", side_effect=rejection):
        resp = client.delete("/api/credentials/slots/exa/credential")
    assert resp.status_code == 403
