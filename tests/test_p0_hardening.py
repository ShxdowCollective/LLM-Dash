"""P0 remediation coverage (2026-07-08 audit): access control (S1), SSRF (S2),
credential-fallback (S3), secret scrub (S5), async cred loads (C1), migration
degrade (C2), atomic DB serving (C3), and the TOCTOU job guard (C4).

These are negative/mechanism tests: they prove the guard rejects the bad case and
the mechanism (atomic replace, reservation) actually engages.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server
import scripts.init_db as init_db
from scripts import server_auth
from scripts.config import ProviderBundle, ProviderConfig, ProviderSecrets
from scripts.run_update import apply_update


# --- helpers --------------------------------------------------------------

def _seed(tmp_path: Path) -> Path:
    db = tmp_path / "dash.sqlite"
    init_db.DB_PATH = db
    init_db.CSV_PATH = tmp_path / "run_metrics.csv"
    init_db.CHANGELOGS_DIR = tmp_path / "changelogs"
    init_db.seed(force=True)
    return db


@pytest.fixture(autouse=True)
def _clean_server_state():
    # Other test modules can leave jobs registered; a stray "running" job would
    # make /api/reset answer 409 before the access-control assertions here.
    server._jobs.clear()
    server._migration_state["error"] = ""
    yield
    server._jobs.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(server.app)


# --- S1: Host / Origin / token access control -----------------------------

def test_host_header_mismatch_rejected(client):
    # A Host the server doesn't recognise is DNS-rebinding -> 403.
    r = client.get("/api/bootstrap-status", headers={"host": "evil.example.com"})
    assert r.status_code == 403


def test_cross_origin_mutation_rejected(client):
    # Cross-site form/fetch POST against loopback -> 403, even without a token.
    r = client.post(
        "/api/reset",
        json={"scope": "stats", "confirm_token": "STATS"},
        headers={"origin": "http://evil.example.com"},
    )
    assert r.status_code == 403


def test_token_required_when_exposed(client, monkeypatch):
    monkeypatch.setenv("LLM_DASH_BIND_HOST", "0.0.0.0")
    monkeypatch.setattr(server, "ACCESS_TOKEN", "s3cr3t-token")
    assert server_auth.token_required() is True

    # No token on an exposed bind -> 401 before the handler runs.
    r = client.post("/api/reset", json={"scope": "stats", "confirm_token": "STATS"})
    assert r.status_code == 401

    # Correct token passes the gate (bad confirm token -> handler 400, not 401).
    r = client.post(
        "/api/reset",
        json={"scope": "stats", "confirm_token": "WRONG"},
        headers={"authorization": "Bearer s3cr3t-token"},
    )
    assert r.status_code == 400


def test_no_token_needed_on_loopback(client, monkeypatch):
    monkeypatch.delenv("LLM_DASH_BIND_HOST", raising=False)
    monkeypatch.delenv("LLM_DASH_HOST", raising=False)
    assert server_auth.token_required() is False
    # Same-origin loopback mutation with no token still reaches the handler.
    r = client.post("/api/reset", json={"scope": "stats", "confirm_token": "WRONG"})
    assert r.status_code == 400  # handler rejected the confirm token, not the gate


def test_token_matches_uses_constant_time_compare():
    assert server_auth.token_matches("Bearer abc123", "abc123") is True
    assert server_auth.token_matches("Bearer abc123", "different") is False
    assert server_auth.token_matches("", "abc123") is False
    assert server_auth.token_matches(None, "abc123") is False


# --- S2: SSRF guard -------------------------------------------------------

def test_ssrf_guard_blocks_private_target(client, monkeypatch):
    monkeypatch.delenv("LLM_DASH_ALLOW_LOCAL_ENDPOINTS", raising=False)
    monkeypatch.setattr(server, "load_provider_bundle", lambda: ProviderBundle(
        config=ProviderConfig(base_url="https://api.stored.example"),
        secrets=ProviderSecrets(api_key="STORED"),
    ))
    r = client.post(
        "/api/provider/test-connection",
        json={"base_url": "http://127.0.0.1:9", "api_key": "x"},
    )
    assert r.status_code == 400
    assert "blocked" in str(r.json()).lower()


def test_ssrf_guard_allows_local_when_opted_in(monkeypatch):
    from scripts.config import guard_ssrf
    monkeypatch.setenv("LLM_DASH_ALLOW_LOCAL_ENDPOINTS", "1")
    guard_ssrf("http://127.0.0.1:11434")  # Ollama opt-in: no raise


# --- S3: custom endpoint never falls back to the live provider key --------

def test_bundle_from_payload_no_key_fallback_for_foreign_url(monkeypatch):
    monkeypatch.setenv("LLM_DASH_ALLOW_LOCAL_ENDPOINTS", "1")  # isolate the key logic
    monkeypatch.setattr(server, "load_provider_bundle", lambda: ProviderBundle(
        config=ProviderConfig(base_url="https://api.stored.example"),
        secrets=ProviderSecrets(api_key="STORED-KEY"),
    ))
    payload = server.ProviderPayload(base_url="https://api.attacker.example")
    bundle = server._bundle_from_payload(payload)
    assert bundle.secrets.api_key == ""  # never the stored key on a foreign URL


def test_bundle_from_payload_reuses_key_for_same_endpoint(monkeypatch):
    monkeypatch.setenv("LLM_DASH_ALLOW_LOCAL_ENDPOINTS", "1")
    monkeypatch.setattr(server, "load_provider_bundle", lambda: ProviderBundle(
        config=ProviderConfig(base_url="https://api.stored.example"),
        secrets=ProviderSecrets(api_key="STORED-KEY"),
    ))
    payload = server.ProviderPayload(base_url="https://api.stored.example")
    bundle = server._bundle_from_payload(payload)
    assert bundle.secrets.api_key == "STORED-KEY"


def test_bundle_from_payload_no_key_for_foreign_models_override(monkeypatch):
    # The request targets models_endpoint, which prefers models_override_url; a
    # foreign override must not inherit the stored key even if base_url matches.
    monkeypatch.setenv("LLM_DASH_ALLOW_LOCAL_ENDPOINTS", "1")
    monkeypatch.setattr(server, "load_provider_bundle", lambda: ProviderBundle(
        config=ProviderConfig(base_url="https://api.stored.example"),
        secrets=ProviderSecrets(api_key="STORED-KEY"),
    ))
    payload = server.ProviderPayload(
        base_url="https://api.stored.example",
        models_override_url="https://api.attacker.example/models",
    )
    bundle = server._bundle_from_payload(payload)
    assert bundle.secrets.api_key == ""
    assert "attacker" in bundle.models_endpoint  # request would have gone there


def test_scope_server_exposure_detection():
    assert server_auth.scope_server_is_exposed(("0.0.0.0", 8787)) is True
    assert server_auth.scope_server_is_exposed(("192.168.1.9", 8787)) is True
    assert server_auth.scope_server_is_exposed(("127.0.0.1", 8787)) is False
    assert server_auth.scope_server_is_exposed(("testserver", 80)) is False  # tests defer to env
    assert server_auth.scope_server_is_exposed(None) is False


def test_custom_endpoint_bearer_no_fallback():
    import scripts.seed_catalog as seed_catalog
    import scripts.run_update as run_update
    assert seed_catalog._read_custom_endpoint_bearer("") == ""
    assert run_update.read_custom_endpoint_bearer("") == ""


# --- S5: value-based secret scrub -----------------------------------------

def test_value_scrub_masks_live_secret(monkeypatch):
    monkeypatch.setenv("MY_PROVIDER_API_KEY", "supersecretvalue123")
    leaked = "connection failed using key supersecretvalue123 to host"
    scrubbed = server._redact_known_secrets(leaked)
    assert "supersecretvalue123" not in scrubbed
    assert "***" in scrubbed


def test_approval_denial_does_not_expose_exception_message(client, monkeypatch):
    raw_detail = "approval denied: traceback at /private/app/broker.py:42"

    def _deny():
        raise server.voidware_auth.VoidwareAuthError(raw_detail, code="approval_denied")

    monkeypatch.setattr(server.voidware_auth, "deny_pending_approval", _deny)
    response = client.post("/api/voidware/broker/approval/deny")

    assert response.status_code == 200
    assert response.json()["message"] == "Voidware approval was denied."
    assert raw_detail not in response.text


# --- C2: migration degrade instead of brick -------------------------------

def test_migration_failure_degrades(tmp_path, monkeypatch):
    db = _seed(tmp_path)

    def _boom(_path):
        raise ValueError("2 score(s) outside [0,10] range - fix before migrating")

    monkeypatch.setattr(server, "DB_PATH", db)
    monkeypatch.setattr(server, "migrate_score_checks", _boom)
    server._migration_state["error"] = ""
    server._run_startup_migrations()  # must NOT raise (was: hard-failed forever)
    assert server._migration_state["error"]  # a visible error was recorded
    assert "read-only" in server._migration_state["error"]
    # The DB is still readable (degraded, not bricked).
    con = sqlite3.connect(db)
    assert con.execute("SELECT COUNT(*) FROM models").fetchone()[0] > 0
    con.close()
    server._migration_state["error"] = ""


# --- C3: atomic DB serving ------------------------------------------------

def test_apply_update_publishes_atomically(tmp_path):
    db = _seed(tmp_path)
    before_inode = db.stat().st_ino
    update = {
        "date": "2099-01-01",
        "new_models": [{"name": "Atomic Test Model", "vendor": "T", "intelligence": 5.0}],
        "score_updates": [],
        "status_changes": [],
        "summary": "atomic serve test",
    }
    metrics = {"started_at": "2099-01-01T00:00:00Z", "completed_at": "2099-01-01T00:00:01Z",
               "duration_sec": 1.0, "agent_name": "test", "notes": "test"}
    apply_update(update, metrics, db, tmp_path / "log.txt",
                 tmp_path / "changelogs", tmp_path / "run_metrics.csv")

    after_inode = db.stat().st_ino
    assert after_inode != before_inode  # os.replace swapped a fresh file in -> atomic
    assert not list(db.parent.glob(db.name + ".writing-*"))  # no leftover temp
    con = sqlite3.connect(db)
    assert con.execute("SELECT COUNT(*) FROM models WHERE name='Atomic Test Model'").fetchone()[0] == 1
    assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    con.close()


# --- C4: TOCTOU job guard -------------------------------------------------

def test_job_slot_reservation_is_exclusive():
    server._jobs.clear()
    first = server._reserve_job_slot()
    assert first is not None
    assert server._any_update_job_running() is True  # counts the "starting" placeholder
    second = server._reserve_job_slot()
    assert second is None  # the slot is already claimed
    server._release_job_slot(first)
    assert server._any_update_job_running() is False
    third = server._reserve_job_slot()
    assert third is not None
    server._release_job_slot(third)
    server._jobs.clear()


# --- C1 / C5 wiring guards -------------------------------------------------

def test_async_routes_offload_credential_loads():
    src = Path(server.__file__).read_text(encoding="utf-8")
    assert "asyncio.to_thread(load_provider_bundle)" in src
    assert "asyncio.to_thread(load_llmstats_api_key)" in src
    assert "asyncio.to_thread(load_aa_api_key)" in src
    assert "asyncio.to_thread(_bundle_from_payload" in src
    assert "asyncio.to_thread(_provider_headers)" in src


def test_changelog_render_is_sanitized():
    root = Path(server.__file__).resolve().parent / "web"
    assert (root / "vendor" / "purify.min.js").exists()
    index = (root / "index.html").read_text(encoding="utf-8")
    assert "vendor/purify.min.js" in index
    app = (root / "app.js").read_text(encoding="utf-8")
    assert "DOMPurify.sanitize(rawHtml)" in app
