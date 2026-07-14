from __future__ import annotations

import json
import tomllib

from llm_dash import __version__
from llm_dash.cli import main
from llm_dash import process
from scripts import build_release


def test_status_json_when_stopped(capsys):
    assert main(["status", "--json", "--port", "9"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["state"] == "stopped"
    assert data["running"] is False
    assert data["url"].endswith(":9")
    assert data["version"] == __version__
    assert data["state_version"] == 1
    assert data["venv_path"]


def test_version_command(capsys):
    assert main(["version"]) == 0
    assert capsys.readouterr().out.strip() == __version__


def test_stop_when_already_stopped(monkeypatch, tmp_path):
    monkeypatch.setattr(process, "SERVER_STATE_PATH", tmp_path / "server.json")
    result = process.stop()
    assert result.state == "stopped"
    assert result.running is False


def test_stop_without_state_does_not_report_unmanaged_ready_server(monkeypatch, tmp_path):
    monkeypatch.setattr(process, "SERVER_STATE_PATH", tmp_path / "server.json")
    monkeypatch.setattr(process, "_ready", lambda url: True)
    result = process.stop()
    assert result.state == "stopped"
    assert result.running is False
    assert result.managed is False


def test_stale_state_cleanup(monkeypatch, tmp_path):
    state_path = tmp_path / "server.json"
    state_path.write_text(
        json.dumps(
            {
                "pid": 99999999,
                "create_time": 1,
                "host": "127.0.0.1",
                "port": 8787,
                "url": "http://127.0.0.1:8787",
                "log_path": str(tmp_path / "server.log"),
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(process, "SERVER_STATE_PATH", state_path)
    result = process.status(cleanup_stale=True)
    assert result.state == "stopped"
    assert not state_path.exists()


def test_unmanaged_status_exits_nonzero(monkeypatch, tmp_path):
    monkeypatch.setattr(process, "SERVER_STATE_PATH", tmp_path / "server.json")
    monkeypatch.setattr(process, "_ready", lambda url: True)
    assert main(["status", "--port", "9876"]) == 1


def test_status_without_filter_uses_managed_state(monkeypatch, tmp_path, capsys):
    class FakeProcess:
        pid = 12345

        def create_time(self):
            return 10.0

    state_path = tmp_path / "server.json"
    state_path.write_text(
        json.dumps(
            {
                "pid": 12345,
                "create_time": 10,
                "host": "127.0.0.1",
                "port": 9000,
                "url": "http://127.0.0.1:9000",
                "log_path": str(tmp_path / "server.log"),
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(process, "SERVER_STATE_PATH", state_path)
    monkeypatch.setattr(process, "_process_from_state", lambda data: FakeProcess())
    monkeypatch.setattr(process, "_ready", lambda url: True)
    assert main(["status", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["managed"] is True
    assert data["port"] == 9000
    assert data["url"].endswith(":9000")


def test_release_manifest_excludes_local_state():
    assert build_release.excluded(".env")
    assert build_release.excluded(".github/workflows/e2e.yml")
    assert build_release.excluded(".npmrc")
    assert build_release.excluded("data/dash.sqlite")
    assert build_release.excluded("data/run_metrics.csv")
    assert build_release.excluded("logs/server.log")
    assert build_release.excluded("docs/plans/private-plan.md")
    assert build_release.excluded("docs/plans/e2e-analysis/final-master-issue-list.md")
    assert build_release.excluded("LOGBOOK.md")
    assert build_release.excluded(".kilo/node_modules/pkg/index.js")
    assert build_release.excluded("llm_dash.egg-info/PKG-INFO")
    assert build_release.excluded("e2e/audit/output/report.json")
    assert not build_release.excluded(".env.example")
    assert not build_release.excluded("install.sh")
    assert not build_release.excluded("web/vendor/sql-wasm.wasm")


def test_release_manifest_contains_required_files():
    files = build_release.source_files()
    build_release.validate_manifest(files)
    required = set(build_release.REQUIRED_PATHS)
    assert required.issubset(set(files))


def test_release_build_dry_run_lists_installer(capsys):
    assert build_release.main(["--version", "v0.0.0-test", "--dry-run"]) == 0
    output = capsys.readouterr().out
    assert "install.sh" in output
    assert "llm_dash/cli.py" in output


def test_pyproject_version_matches_package():
    data = tomllib.loads((build_release.ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert data["project"]["version"] == __version__


def test_pyproject_dependencies_match_requirements():
    data = tomllib.loads((build_release.ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    pyproject_deps = sorted(dep.lower() for dep in data["project"]["dependencies"])
    requirements = sorted(
        line.strip().lower()
        for line in (build_release.ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    )
    assert pyproject_deps == requirements


def test_exposed_server_announcement_does_not_print_access_token(monkeypatch, tmp_path, capsys):
    from llm_dash import cli
    from scripts import server_auth

    sentinel = "secret-token-regression-sentinel"
    monkeypatch.setattr(server_auth, "token_required", lambda: True)
    monkeypatch.setattr(server_auth, "load_or_create_token", lambda: sentinel)
    monkeypatch.setattr(server_auth, "_token_path", lambda: tmp_path / "llmdash_access_token")

    cli._announce_access_token("0.0.0.0", 8787)

    output = capsys.readouterr().out
    assert sentinel not in output
    assert "llmdash_access_token" in output
    assert "token values are not printed" in output
