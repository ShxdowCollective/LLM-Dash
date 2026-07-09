"""T4: schedule_job — payload normalization, file round-trip, and the
apply/remove/status API shape with all OS scheduler calls mocked.
"""

from __future__ import annotations

import json

import pytest

from scripts import schedule_job


@pytest.fixture
def sched_path(tmp_path, monkeypatch):
    p = tmp_path / "config" / "shxdow.llmdash.schedule.json"
    monkeypatch.setattr(schedule_job, "SCHEDULE_PATH", p)
    return p


# --- payload normalization ------------------------------------------------

def test_normalize_payload_defaults_and_padding():
    out = schedule_job._normalize_payload({"cadence": "daily", "time_local": "9:5"})
    assert out == {"cadence": "daily", "time_local": "09:05", "day_of_week": 1, "day_of_month": 1}


@pytest.mark.parametrize("bad", [
    {"cadence": "hourly"},
    {"cadence": "daily", "time_local": "25:00"},
    {"cadence": "daily", "time_local": "10:70"},
    {"cadence": "weekly", "day_of_week": 8},
    {"cadence": "monthly", "day_of_month": 29},
])
def test_normalize_payload_rejects_bad_input(bad):
    with pytest.raises(schedule_job.ScheduleError):
        schedule_job._normalize_payload(bad)


def test_utc_echo_format():
    echo = schedule_job.utc_echo("09:00")
    assert echo.endswith("UTC")
    assert len(echo.split(":")[0]) == 2  # HH zero-padded


# --- file round-trip ------------------------------------------------------

def test_schedule_file_round_trip(sched_path):
    assert schedule_job._read_schedule_file() == {}  # missing -> empty
    payload = {"cadence": "weekly", "time_local": "08:30", "day_of_week": 3, "manager": "systemd"}
    schedule_job._write_schedule_file(payload)
    assert sched_path.exists()
    assert schedule_job._read_schedule_file() == payload
    # File is valid, human-readable JSON.
    assert json.loads(sched_path.read_text())["cadence"] == "weekly"


def test_read_schedule_ignores_non_dict(sched_path):
    sched_path.parent.mkdir(parents=True, exist_ok=True)
    sched_path.write_text("[1, 2, 3]")
    assert schedule_job._read_schedule_file() == {}


# --- apply / status / remove API shape (OS calls mocked) ------------------

def test_apply_schedule_writes_and_reports(sched_path, monkeypatch):
    monkeypatch.setattr(schedule_job, "_platform_id", lambda: "linux")
    monkeypatch.setattr(schedule_job, "_install_systemd", lambda s: {
        "manager": "systemd", "job_id": "shxdow.llmdash.update", "log_path": "/tmp/x.log",
    })
    monkeypatch.setattr(schedule_job, "_job_present", lambda data: True)

    result = schedule_job.apply_schedule({"cadence": "daily", "time_local": "07:15"})
    assert result["enabled"] is True
    assert result["cadence"] == "daily"
    assert result["time_local"] == "07:15"
    assert result["manager"] == "systemd"
    assert result["job_present"] is True
    assert result["utc_echo"].endswith("UTC")
    # Persisted to disk.
    assert schedule_job._read_schedule_file()["cadence"] == "daily"


def test_apply_off_calls_remove(sched_path, monkeypatch):
    monkeypatch.setattr(schedule_job, "_platform_id", lambda: "linux")
    removed = {"called": False}
    monkeypatch.setattr(schedule_job, "_remove_systemd", lambda: removed.__setitem__("called", True))
    monkeypatch.setattr(schedule_job, "_job_present", lambda data: False)
    # Seed an enabled schedule so remove has something to tear down.
    schedule_job._write_schedule_file({"cadence": "daily", "enabled": True, "manager": "systemd", "platform": "linux"})

    result = schedule_job.apply_schedule({"cadence": "off"})
    assert removed["called"] is True
    assert result["enabled"] is False
    assert result["cadence"] == "off"


def test_status_shape_when_unset(sched_path, monkeypatch):
    monkeypatch.setattr(schedule_job, "_platform_id", lambda: "linux")
    monkeypatch.setattr(schedule_job, "_job_present", lambda data: False)
    st = schedule_job.status()
    for key in ("enabled", "cadence", "time_local", "utc_echo", "job_present", "platform", "manager", "job_id"):
        assert key in st
    assert st["enabled"] is False
    assert st["cadence"] == "off"


def test_remove_schedule_disables(sched_path, monkeypatch):
    monkeypatch.setattr(schedule_job, "_platform_id", lambda: "linux")
    monkeypatch.setattr(schedule_job, "_remove_systemd", lambda: None)
    monkeypatch.setattr(schedule_job, "_job_present", lambda data: False)
    schedule_job._write_schedule_file({"cadence": "daily", "enabled": True, "manager": "systemd", "platform": "linux"})

    st = schedule_job.remove_schedule()
    assert st["enabled"] is False
    assert st["cadence"] == "off"
    assert schedule_job._read_schedule_file()["enabled"] is False


def test_main_status_json_envelope(sched_path, monkeypatch, capsys):
    monkeypatch.setattr(schedule_job, "_platform_id", lambda: "linux")
    monkeypatch.setattr(schedule_job, "_job_present", lambda data: False)
    monkeypatch.setattr("sys.argv", ["schedule_job.py", "status"])
    rc = schedule_job.main()
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is True
    assert out["cadence"] == "off"
