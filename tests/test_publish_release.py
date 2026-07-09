"""T9: publish_release.py — the --dry-run path must print the plan and mutate
nothing (no git tag/push, no gh release), plus the pure metadata helpers.
"""

from __future__ import annotations

import pytest

from scripts import publish_release


def test_dry_run_mutates_nothing(monkeypatch, capsys):
    # gh presence is checked even in dry-run; pretend it's installed.
    monkeypatch.setattr(publish_release.shutil, "which", lambda name: "/usr/bin/gh")

    # In dry-run, run() prints instead of executing and no git_out is reached, so
    # subprocess.run must never fire. Make it explode if it does.
    def _boom(*a, **k):  # pragma: no cover - only runs on failure
        raise AssertionError(f"dry-run must not shell out: {a!r}")

    monkeypatch.setattr(publish_release.subprocess, "run", _boom)

    rc = publish_release.main(["--version", "v9.9.9", "--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry run" in out.lower()
    assert "would run" in out  # planned commands printed, not executed


def test_invalid_version_rejected(monkeypatch):
    monkeypatch.setattr(publish_release.shutil, "which", lambda name: "/usr/bin/gh")
    with pytest.raises(SystemExit):
        publish_release.main(["--version", "1.0.0", "--dry-run"])  # missing leading 'v'


def test_missing_gh_rejected(monkeypatch):
    monkeypatch.setattr(publish_release.shutil, "which", lambda name: None)
    with pytest.raises(SystemExit):
        publish_release.main(["--version", "v1.0.0", "--dry-run"])


def test_pyproject_version_matches_repo():
    # The real pyproject.toml is readable and parses to a version string.
    assert publish_release.pyproject_version() is not None


def test_changelog_notes_missing_section_returns_none():
    assert publish_release.changelog_notes("v0.0.0-nonexistent") is None
