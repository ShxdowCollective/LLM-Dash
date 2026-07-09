"""T2: migrate_score_checks — the destructive schema_version 1->2 rebuild.

Covers the three failure modes the audit flagged: a clean v1->v2 success, an
out-of-range score that raises and leaves v1 untouched, and a mid-transaction
failure that rolls back with the original table intact.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from scripts.migrate_score_checks import (
    TARGET_VERSION,
    current_schema_version,
    migrate,
    needs_migration,
)


def _make_v1_db(path: Path, *, scores=((5.0, 6.0, 7.0, 8.0, 9.0),)) -> None:
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE models (id INTEGER PRIMARY KEY, name TEXT NOT NULL, vendor TEXT);
        CREATE TABLE model_scores (
            id INTEGER PRIMARY KEY,
            model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
            as_of TEXT NOT NULL,
            intelligence REAL, coding REAL, agents REAL, speed REAL, cost REAL,
            source_notes TEXT,
            UNIQUE (model_id, as_of)
        );
        CREATE INDEX idx_scores_model_date ON model_scores(model_id, as_of DESC);
        CREATE VIEW v_models_latest AS
            SELECT m.*, s.as_of AS scores_as_of, s.intelligence, s.coding, s.agents, s.speed, s.cost
            FROM models m LEFT JOIN model_scores s ON s.id = (
                SELECT id FROM model_scores WHERE model_id = m.id ORDER BY as_of DESC, id DESC LIMIT 1);
        INSERT INTO meta (key, value) VALUES ('schema_version', '1');
        INSERT INTO models (id, name, vendor) VALUES (1, 'Test Model', 'ACME');
        """
    )
    for i, row in enumerate(scores):
        con.execute(
            "INSERT INTO model_scores (model_id, as_of, intelligence, coding, agents, speed, cost) "
            "VALUES (1, ?, ?, ?, ?, ?, ?)",
            (f"2026-01-0{i + 1}", *row),
        )
    con.commit()
    con.close()


def _has_check_constraint(path: Path) -> bool:
    con = sqlite3.connect(path)
    try:
        sql = con.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='model_scores'"
        ).fetchone()[0]
        return "CHECK" in sql.upper()
    finally:
        con.close()


def test_migrate_valid_v1_to_v2(tmp_path):
    db = tmp_path / "dash.sqlite"
    _make_v1_db(db)
    assert not _has_check_constraint(db)

    assert migrate(db) is True

    con = sqlite3.connect(db)
    try:
        assert current_schema_version(con) == TARGET_VERSION
        assert not needs_migration(con)
        # Data preserved through the rebuild.
        row = con.execute("SELECT intelligence, cost FROM model_scores WHERE model_id=1").fetchone()
        assert row == (5.0, 9.0)
    finally:
        con.close()
    assert _has_check_constraint(db)


def test_migrate_is_idempotent(tmp_path):
    db = tmp_path / "dash.sqlite"
    _make_v1_db(db)
    assert migrate(db) is True
    # Already at v2 -> no-op, returns False.
    assert migrate(db) is False


def test_migrate_dry_run_does_not_mutate(tmp_path):
    db = tmp_path / "dash.sqlite"
    _make_v1_db(db)
    assert migrate(db, dry_run=True) is True
    con = sqlite3.connect(db)
    try:
        assert current_schema_version(con) == 1  # unchanged
    finally:
        con.close()
    assert not _has_check_constraint(db)


def test_out_of_range_score_raises_and_leaves_v1(tmp_path):
    db = tmp_path / "dash.sqlite"
    _make_v1_db(db, scores=((5.0, 6.0, 7.0, 8.0, 11.0),))  # cost 11 > 10

    with pytest.raises(ValueError, match="outside"):
        migrate(db)

    con = sqlite3.connect(db)
    try:
        assert current_schema_version(con) == 1  # not migrated
        # Still the original (constraint-free) table with the bad row intact.
        assert con.execute("SELECT cost FROM model_scores").fetchone()[0] == 11.0
    finally:
        con.close()
    assert not _has_check_constraint(db)


def test_mid_transaction_failure_rolls_back(tmp_path, monkeypatch):
    db = tmp_path / "dash.sqlite"
    _make_v1_db(db)

    # sqlite3.Connection is immutable, so wrap a real connection in a proxy that
    # raises once the rebuild's first CREATE runs inside the transaction. migrate()
    # should ROLLBACK and re-raise, leaving v1 intact.
    import scripts.migrate_score_checks as msc
    real_connect = sqlite3.connect

    class _FlakyConn:
        def __init__(self, real):
            self._real = real
            self._begun = False

        def execute(self, sql, *args, **kwargs):
            s = str(sql).strip().upper()
            if s.startswith("BEGIN"):
                self._begun = True
            if self._begun and "CREATE TABLE MODEL_SCORES_NEW" in s:
                raise sqlite3.OperationalError("simulated mid-transaction failure")
            return self._real.execute(sql, *args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._real, name)

    monkeypatch.setattr(msc.sqlite3, "connect", lambda p, *a, **k: _FlakyConn(real_connect(p, *a, **k)))

    with pytest.raises(sqlite3.OperationalError, match="simulated"):
        migrate(db)

    monkeypatch.undo()
    con = real_connect(db)
    try:
        # ROLLBACK left v1 intact: original table + version, no leftover _new table.
        assert current_schema_version(con) == 1
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "model_scores" in tables
        assert "model_scores_new" not in tables
        assert con.execute("SELECT COUNT(*) FROM model_scores").fetchone()[0] == 1
    finally:
        con.close()
    assert not _has_check_constraint(db)


def test_migrate_missing_db_returns_false(tmp_path):
    assert migrate(tmp_path / "absent.sqlite") is False
