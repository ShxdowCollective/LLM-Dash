"""P1 remediation coverage (2026-07-08 audit): watch-job robustness (H2/T1),
cancel endpoint incl. kill fallback (T3), run-update status shape + 404 (T9),
reset-scope parametrization (T9), and credential-slot success paths (T5).

Server-layer tests: the credential/slot config functions and destructive reset
are stubbed so these exercise the route/validation/shaping and the job state
machine, not keyring/broker or real file deletion.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server
from scripts.config import CredentialSlotConfig


@pytest.fixture(autouse=True)
def _clean_jobs(monkeypatch):
    monkeypatch.delenv("LLM_DASH_BIND_HOST", raising=False)
    monkeypatch.delenv("LLM_DASH_HOST", raising=False)
    server._jobs.clear()
    yield
    server._jobs.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(server.app)


class _FakeProc:
    """Stand-in for subprocess.Popen with scriptable wait()/terminate()/kill()."""

    def __init__(self, *, exit_code=0, wait_raises=None, timeout_first=False):
        self._exit_code = exit_code
        self._wait_raises = wait_raises
        self._timeout_first = timeout_first
        self.returncode = None
        self.terminated = False
        self.killed = False
        self._waits = 0

    def wait(self, timeout=None):
        self._waits += 1
        if self._wait_raises is not None:
            raise self._wait_raises
        # Cancel path: first bounded wait() times out -> caller must kill().
        if self._timeout_first and timeout is not None and self._waits == 1:
            raise subprocess.TimeoutExpired(cmd="run", timeout=timeout)
        self.returncode = self._exit_code
        return self._exit_code

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True
        self.returncode = -9


def _register(job_id="job1", **over):
    job = {
        "id": job_id,
        "state": "running",
        "started_at": "2026-07-08T00:00:00Z",
        "completed_at": None,
        "exit_code": None,
        "kind": "refresh",
        "source": "exa",
        "log_path": "logs/does-not-exist.log",
        "process": None,
        "tail": "",
    }
    job.update(over)
    server._jobs[job_id] = job
    return job


# --- T1 / H2: _watch_job state machine + robustness -----------------------

@pytest.mark.parametrize(
    "exit_code,cancel,expected",
    [(0, False, "succeeded"), (1, False, "failed"), (0, True, "canceled")],
)
def test_watch_job_final_state(exit_code, cancel, expected):
    proc = _FakeProc(exit_code=exit_code)
    _register(process=proc, cancel_requested=cancel)
    server._watch_job("job1", proc, Path("logs/does-not-exist.log"))
    job = server._jobs["job1"]
    assert job["state"] == expected
    assert job["exit_code"] == exit_code
    assert "process" not in job  # process handle dropped after completion


def test_watch_job_survives_wait_exception(monkeypatch):
    # H2: an unexpected watcher error must fail the job, never leave it "running".
    proc = _FakeProc(wait_raises=RuntimeError("boom"))
    _register(process=proc)
    server._watch_job("job1", proc, Path("logs/does-not-exist.log"))
    job = server._jobs["job1"]
    assert job["state"] == "failed"
    assert "boom" in job.get("error", "")
    assert "process" not in job


def test_watch_job_ignores_vanished_job():
    proc = _FakeProc(exit_code=0)
    # No registration: watcher should no-op, not raise.
    server._watch_job("ghost", proc, Path("logs/does-not-exist.log"))
    assert "ghost" not in server._jobs


def test_job_age_and_stale_flag():
    job = _register(started_at="2000-01-01T00:00:00Z")
    age = server._job_age_seconds(job)
    assert age is not None and age > server.JOB_MAX_AGE_SECONDS
    assert server._job_age_seconds({"started_at": "not-a-date"}) is None
    assert server._job_age_seconds({}) is None


# --- T3: cancel endpoint (terminate, and kill fallback on timeout) --------

def _real_proc():
    # The cancel route gates on isinstance(process, subprocess.Popen), so these
    # use a real long-lived child process.
    return subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])


def test_cancel_terminates_running_job(client):
    proc = _real_proc()
    _register(process=proc)
    try:
        r = client.post("/api/run-update/job1/cancel")
        assert r.status_code == 200
        body = r.json()
        assert body["state"] == "canceled"
        assert proc.returncode is not None  # terminated and reaped within the 5s wait
        assert "process" not in body
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def test_cancel_kills_on_timeout(client, monkeypatch):
    proc = _real_proc()
    orig_wait = proc.wait
    calls = {"killed": False}

    def fake_wait(timeout=None):
        raise subprocess.TimeoutExpired(cmd="run", timeout=timeout or 5)

    real_kill = proc.kill

    def fake_kill():
        calls["killed"] = True
        real_kill()

    monkeypatch.setattr(proc, "wait", fake_wait)
    monkeypatch.setattr(proc, "kill", fake_kill)
    _register(process=proc)
    try:
        r = client.post("/api/run-update/job1/cancel")
        assert r.status_code == 200
        assert calls["killed"] is True  # bounded wait timed out -> kill fallback
    finally:
        orig_wait(timeout=5)  # reap the SIGKILLed child


def test_cancel_unknown_job_404(client):
    assert client.post("/api/run-update/nope/cancel").status_code == 404


def test_cancel_noop_on_finished_job(client):
    _register(state="succeeded", process=None)
    r = client.post("/api/run-update/job1/cancel")
    assert r.status_code == 200
    assert r.json()["state"] == "succeeded"


# --- T9: run-update status shape + 404 ------------------------------------

def test_status_shape_running(client):
    _register(process=_FakeProc(), started_at="2000-01-01T00:00:00Z")
    r = client.get("/api/run-update/job1")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "job1"
    assert body["state"] == "running"
    assert "age_seconds" in body and isinstance(body["age_seconds"], int)
    assert body["stale"] is True  # far-past start -> exceeds JOB_MAX_AGE_SECONDS
    assert "process" not in body


def test_status_stale_false_for_fresh_job(client, monkeypatch):
    # Freeze "now" close to started_at so the job reads as fresh.
    _register(process=_FakeProc(), started_at="2026-07-08T00:00:00Z")
    import datetime as dt

    class _FrozenDT(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return dt.datetime(2026, 7, 8, 0, 0, 30, tzinfo=tz)

    monkeypatch.setattr(server.dt, "datetime", _FrozenDT)
    body = client.get("/api/run-update/job1").json()
    assert body["age_seconds"] == 30
    assert body["stale"] is False


def test_status_unknown_job_404(client):
    assert client.get("/api/run-update/nope").status_code == 404


# --- T9: reset-scope parametrization over all four scopes -----------------

@pytest.mark.parametrize("scope,token", [("stats", "STATS"), ("changelog", "CHANGELOG"), ("models", "MODELS"), ("full", "RESET")])
def test_reset_scopes_ok(client, monkeypatch, scope, token):
    import scripts.reset_local_state as reset_mod
    monkeypatch.setattr(reset_mod, "run_scope", lambda s: {"scope": s, "cleared": ["stub"]})
    r = client.post("/api/reset", json={"scope": scope, "confirm_token": token})
    assert r.status_code == 200
    assert r.json()["scope"] == scope


@pytest.mark.parametrize("scope,token", [("stats", "STATS"), ("changelog", "CHANGELOG"), ("models", "MODELS"), ("full", "RESET")])
def test_reset_wrong_token_rejected(client, scope, token):
    r = client.post("/api/reset", json={"scope": scope, "confirm_token": token + "X"})
    assert r.status_code == 400


def test_reset_unknown_scope_rejected(client):
    r = client.post("/api/reset", json={"scope": "everything", "confirm_token": "RESET"})
    assert r.status_code == 400


# --- T5: credential-slot 200 success paths --------------------------------

def _sel(name="LLM_DASH_PROVIDER_API_KEY"):
    return CredentialSlotConfig(
        credential_name=name,
        credential_ref="",
        credential_meta={},
        credential_grant={},
    )


def test_slot_save_ok(client, monkeypatch):
    monkeypatch.setattr(server, "save_slot_api_key", lambda slot, key: _sel())
    r = client.post("/api/credentials/slots/provider/save", json={"api_key": "sk-test"})
    assert r.status_code == 200
    body = r.json()
    assert body["slot"] == "provider"
    assert body["configured"] is True
    assert body["selection"]["name"] == "LLM_DASH_PROVIDER_API_KEY"


def test_slot_update_ok(client, monkeypatch):
    monkeypatch.setattr(server, "update_slot_api_key", lambda slot, key, **kw: _sel())
    r = client.post("/api/credentials/slots/exa/update", json={"api_key": "sk-2"})
    assert r.status_code == 200
    assert r.json()["slot"] == "exa"


def test_slot_select_ok(client, monkeypatch):
    monkeypatch.setattr(server, "select_credential_slot", lambda slot, **kw: _sel("chosen"))
    r = client.post("/api/credentials/slots/llmstats/select", json={"credential_name": "chosen"})
    assert r.status_code == 200
    assert r.json()["selection"]["name"] == "chosen"


def test_slot_clear_selection_ok(client, monkeypatch):
    monkeypatch.setattr(server, "clear_credential_slot_selection", lambda slot: None)
    r = client.request("DELETE", "/api/credentials/slots/aa/selection")
    assert r.status_code == 200
    assert r.json()["selection_cleared"] is True


def test_slot_delete_credential_ok(client, monkeypatch):
    monkeypatch.setattr(server, "delete_slot_credential", lambda slot, **kw: None)
    r = client.request("DELETE", "/api/credentials/slots/provider/credential")
    assert r.status_code == 200
    assert r.json()["credential_deleted"] is True


def test_slot_invalid_slot_rejected(client):
    r = client.post("/api/credentials/slots/bogus/save", json={"api_key": "x"})
    assert r.status_code == 404


# --- H1: broker-availability failure logs WARNING; not-configured stays quiet ---

def test_broker_unavailable_logs_warning(monkeypatch, caplog):
    import logging
    from scripts import config, voidware_auth

    def _raise(*a, **k):
        raise voidware_auth.VoidwareAuthError("bridge down", code="bridge_unavailable")

    monkeypatch.setattr(voidware_auth, "read_secret_with_grant", _raise)
    with caplog.at_level(logging.WARNING, logger="llm_dash.config"):
        assert config._read_broker_secret("PROVIDER_KEY") == ""
    assert any("broker unavailable" in r.message.lower() for r in caplog.records)


def test_broker_fresh_grant_is_quiet(monkeypatch, caplog):
    import logging
    from scripts import config, voidware_auth

    code = next(iter(voidware_auth.FRESH_GRANT_CODES))

    def _raise(*a, **k):
        raise voidware_auth.VoidwareAuthError("needs grant", code=code)

    monkeypatch.setattr(voidware_auth, "read_secret_with_grant", _raise)
    with caplog.at_level(logging.WARNING, logger="llm_dash.config"):
        assert config._read_broker_secret("PROVIDER_KEY") == ""
    assert not caplog.records  # not-configured path must not warn
