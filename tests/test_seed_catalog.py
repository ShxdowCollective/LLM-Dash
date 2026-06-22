"""Tests for catalog seed backend (no network or model calls)."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import config
from scripts.init_db import ensure_schema
from scripts.run_update import apply_update, iso_z, local_date, utc_now, validate_update
from scripts.seed_catalog import _sum_usage, build_seed_prompt


def _sample_model(name: str = "Test Model Alpha") -> dict:
    return {
        "name": name,
        "vendor": "TestCo",
        "color": "#112233",
        "released": "Jan 2026",
        "params": "Proprietary",
        "pricing": "$1 / $2",
        "notes": "https://example.com/model",
        "card_url": "https://example.com/model",
        "input_capabilities": ["text"],
        "intelligence": 7.0,
        "coding": 7.5,
        "agents": 6.5,
        "speed": 8.0,
        "cost": 7.0,
    }


class EnsureSchemaTests(unittest.TestCase):
    def test_creates_models_table_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "dash.sqlite"
            self.assertFalse(db_path.exists())
            ensure_schema(db_path)
            self.assertTrue(db_path.exists())
            con = sqlite3.connect(db_path)
            try:
                row = con.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='models'"
                ).fetchone()
                self.assertIsNotNone(row)
            finally:
                con.close()
            ensure_schema(db_path)
            con = sqlite3.connect(db_path)
            try:
                tables = {
                    row[0]
                    for row in con.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    ).fetchall()
                }
                self.assertIn("models", tables)
                self.assertIn("model_scores", tables)
                self.assertIn("meta", tables)
            finally:
                con.close()


class SumUsageTests(unittest.TestCase):
    def test_sums_tokens_and_exa_counts_across_batches(self):
        usages = [
            {"tokens_input": 100, "tokens_output": 20, "cost_usd": 0.01, "exa_searches": 3, "exa_fetches": 2},
            {"tokens_input": 50, "tokens_output": 10, "cost_usd": 0.02, "exa_searches": 1, "exa_fetches": 4},
        ]
        totals = _sum_usage(usages)
        self.assertEqual(totals["tokens_input"], 150)
        self.assertEqual(totals["tokens_output"], 30)
        self.assertAlmostEqual(totals["cost_usd"], 0.03)
        self.assertEqual(totals["exa_searches"], 4)
        self.assertEqual(totals["exa_fetches"], 6)

    def test_exa_counts_default_zero_when_absent(self):
        totals = _sum_usage([{"tokens_input": 5}])
        self.assertEqual(totals["exa_searches"], 0)
        self.assertEqual(totals["exa_fetches"], 0)


class ValidateUpdateTests(unittest.TestCase):
    def test_accepts_all_new_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "dash.sqlite"
            ensure_schema(db_path)
            update = {
                "date": local_date(),
                "title": "Seed",
                "summary": "All new",
                "new_models": [_sample_model()],
                "score_updates": [],
                "status_changes": [],
            }
            validate_update(update, db_path)


class ApplyUpdateTests(unittest.TestCase):
    def test_all_new_payload_writes_db_changelog_and_meta(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            changelogs_dir = root / "changelogs"
            csv_path = root / "run_metrics.csv"
            ensure_schema(db_path)
            date_value = local_date()
            update = {
                "date": date_value,
                "title": "Catalog seed",
                "summary": "Initial seed",
                "new_models": [_sample_model(), _sample_model("Test Model Beta")],
                "score_updates": [],
                "status_changes": [],
            }
            started = utc_now()
            metrics = {
                "started_at": iso_z(started),
                "completed_at": iso_z(started),
                "duration_sec": 0.1,
                "agent_name": "test-seed",
                "notes": "test seed",
            }
            log_path = root / "seed.log"
            apply_update(update, metrics, db_path, log_path, changelogs_dir, csv_path)

            con = sqlite3.connect(db_path)
            try:
                count = con.execute("SELECT COUNT(*) FROM models").fetchone()[0]
                self.assertEqual(count, 2)
                last_updated = con.execute(
                    "SELECT value FROM meta WHERE key = 'last_updated'"
                ).fetchone()
                self.assertIsNotNone(last_updated)
            finally:
                con.close()

            changelog_file = changelogs_dir / f"{date_value}.md"
            self.assertTrue(changelog_file.exists())
            self.assertTrue(csv_path.exists())

            # A seed run supplies new_models but no changelog_markdown; the body
            # must describe the added models, never the misleading "no updates"
            # fallback.
            body = changelog_file.read_text(encoding="utf-8")
            self.assertNotIn("No model or score updates were found", body)
            self.assertIn("## New models (2)", body)
            self.assertIn("Test Model Alpha — TestCo", body)
            self.assertIn("Test Model Beta — TestCo", body)

    def test_empty_update_keeps_no_changes_message(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            changelogs_dir = root / "changelogs"
            csv_path = root / "run_metrics.csv"
            ensure_schema(db_path)
            date_value = local_date()
            update = {
                "date": date_value,
                "title": "Quiet day",
                "summary": "",
                "new_models": [],
                "score_updates": [],
                "status_changes": [],
            }
            started = utc_now()
            metrics = {
                "started_at": iso_z(started),
                "completed_at": iso_z(started),
                "duration_sec": 0.1,
                "agent_name": "test-seed",
                "notes": "test seed",
            }
            apply_update(update, metrics, db_path, root / "seed.log", changelogs_dir, csv_path)
            body = (changelogs_dir / f"{date_value}.md").read_text(encoding="utf-8")
            self.assertIn("No model or score updates were found", body)


class AASlotTests(unittest.TestCase):
    def test_aa_slot_wiring(self):
        self.assertIn("aa", config.CREDENTIAL_SLOTS)
        with patch.dict("os.environ", {}, clear=True):
            with patch.object(config, "_read_secret", return_value=""):
                self.assertEqual(config.load_aa_api_key(), "")
        with patch.object(config, "load_aa_api_key", return_value=""):
            with patch.object(config, "load_provider_config") as mock_cfg:
                mock_cfg.return_value = config.ProviderConfig()
                with patch.object(config, "load_credential_slot") as mock_slot:
                    mock_slot.return_value = config.CredentialSlotConfig()
                    with patch.object(config, "_credential_source", return_value={"configured": False}):
                        state = config.public_provider_state()
        self.assertIn("aa_configured", state)
        self.assertFalse(state["aa_configured"])


class BuildSeedPromptTests(unittest.TestCase):
    def test_prompt_includes_rubric_and_candidates(self):
        candidates = [{"name": "GPT-5.4"}, {"name": "Claude Opus 4.7"}]
        prompt = build_seed_prompt(
            candidates,
            preset="aa",
            count=2,
            index="intelligence",
            prompt_text="",
            skill_text="Score on intelligence, coding, agents, speed, cost (0-10).",
            batch_index=1,
            batch_total=1,
        )
        self.assertIn("SKILL.md", prompt)
        self.assertIn("intelligence, coding, agents, speed, cost", prompt)
        self.assertIn("GPT-5.4", prompt)
        self.assertIn("Claude Opus 4.7", prompt)
        self.assertIn("new_models", prompt)


if __name__ == "__main__":
    unittest.main()
