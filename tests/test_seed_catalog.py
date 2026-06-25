"""Tests for catalog seed backend (no network or model calls)."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from scripts import config
from scripts.init_db import ensure_schema
from scripts.run_update import RunUpdateError, apply_update, iso_z, local_date, utc_now, validate_update
from scripts.seed_catalog import (
    SeedCatalogError,
    _dedupe_models,
    _fetch_custom_endpoint_candidates,
    _fetch_llmstats_candidates,
    _fetch_openrouter_candidates,
    _sum_usage,
    build_seed_prompt,
    run_seed,
)


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


class _FakeResponse:
    def __init__(self, payload: dict | list, status_code: int = 200, text: str = ""):
        self._payload = payload
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


class _FakeHttpClient:
    calls: list[dict] = []
    response = _FakeResponse({})

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, **kwargs):
        self.__class__.calls.append({"url": url, **kwargs})
        return self.__class__.response


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


class CandidateFetcherTests(unittest.TestCase):
    def test_dedupe_models_normalizes_spacing(self):
        models = [_sample_model("Model A"), _sample_model("  model   a  "), _sample_model("Model B")]
        self.assertEqual([item["name"] for item in _dedupe_models(models)], ["Model A", "Model B"])

    def test_llmstats_fetch_requests_extra_rows_and_dedupes_to_count(self):
        _FakeHttpClient.calls = []
        _FakeHttpClient.response = _FakeResponse(
            {
                "data": [
                    {"name": "Model A"},
                    {"name": "Model A"},
                    {"name": "Model B"},
                    {"name": "Model C"},
                ]
            }
        )
        with (
            patch("scripts.seed_catalog.load_llmstats_api_key", return_value="test-key"),
            patch("httpx.Client", _FakeHttpClient),
        ):
            candidates = _fetch_llmstats_candidates(3)

        self.assertEqual([item["name"] for item in candidates], ["Model A", "Model B", "Model C"])
        self.assertEqual(_FakeHttpClient.calls[0]["params"], {"limit": "9"})

    def test_openrouter_fetch_dedupes_before_counting(self):
        _FakeHttpClient.calls = []
        _FakeHttpClient.response = _FakeResponse(
            {
                "data": [
                    {"id": "dup/model", "context_length": 20, "created": 3},
                    {"id": "dup/model", "context_length": 19, "created": 2},
                    {"id": "next/model", "context_length": 18, "created": 1},
                ]
            }
        )
        bundle = Namespace(secrets=Namespace(api_key=""), config=Namespace(base_url=""))
        with (
            patch("scripts.seed_catalog.load_provider_bundle", return_value=bundle),
            patch("httpx.Client", _FakeHttpClient),
        ):
            candidates = _fetch_openrouter_candidates(2)

        self.assertEqual([item["name"] for item in candidates], ["dup/model", "next/model"])

    def test_custom_endpoint_fetch_dedupes_before_counting(self):
        _FakeHttpClient.calls = []
        _FakeHttpClient.response = _FakeResponse(
            {"data": [{"id": "model-a"}, {"id": "model-a"}, {"id": "model-b"}]}
        )
        with (
            patch("scripts.seed_catalog._read_custom_endpoint_bearer", return_value=""),
            patch("httpx.Client", _FakeHttpClient),
        ):
            candidates = _fetch_custom_endpoint_candidates("https://example.com/v1", "", 2)

        self.assertEqual([item["name"] for item in candidates], ["model-a", "model-b"])

    def test_custom_endpoint_fetch_accepts_top_level_array_payload(self):
        _FakeHttpClient.calls = []
        _FakeHttpClient.response = _FakeResponse([{"id": "model-a"}, {"id": "model-b"}])
        with (
            patch("scripts.seed_catalog._read_custom_endpoint_bearer", return_value=""),
            patch("httpx.Client", _FakeHttpClient),
        ):
            candidates = _fetch_custom_endpoint_candidates("https://example.com/v1/models", "", 2)

        self.assertEqual([item["name"] for item in candidates], ["model-a", "model-b"])


class RunSeedCountTests(unittest.TestCase):
    def _args(self, count: int, preset: str = "aa") -> Namespace:
        return Namespace(
            preset=preset,
            count=count,
            index="intelligence",
            prompt="",
            endpoint="https://example.com/v1",
            credential="",
        )

    def test_prefetched_batches_recover_missing_candidate_models(self):
        candidates = [{"name": f"Model {idx}"} for idx in range(1, 51)]
        calls: list[str] = []

        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            calls.append(prompt)
            if len(calls) == 1:
                models = [_sample_model(f"Model {idx}") for idx in range(1, 21)]
            elif len(calls) == 2:
                models = [_sample_model(f"Model {idx}") for idx in range(21, 26)]
            else:
                models = [_sample_model(f"Model {idx}") for idx in range(26, 51)]
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": models,
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with (
                patch("scripts.seed_catalog.prefetch_candidates", return_value=candidates),
                patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
            ):
                result = run_seed(
                    self._args(50),
                    db_path=db_path,
                    log_path=root / "seed.log",
                    changelogs_dir=root / "changelogs",
                    csv_path=root / "run_metrics.csv",
                )

        self.assertEqual(result["models"], 50)
        self.assertEqual(len(result["update"]["new_models"]), 50)
        self.assertEqual(len(calls), 3)
        self.assertIn("Recovery pass", calls[1])

    def test_prefetched_batch_fails_if_recovery_still_omits_models(self):
        candidates = [{"name": "Model 1"}, {"name": "Model 2"}]

        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": [_sample_model("Model 1")],
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with (
                patch("scripts.seed_catalog.prefetch_candidates", return_value=candidates),
                patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
            ):
                with self.assertRaisesRegex(RunUpdateError, "missing: Model 2"):
                    run_seed(
                        self._args(2),
                        db_path=db_path,
                        log_path=root / "seed.log",
                        changelogs_dir=root / "changelogs",
                        csv_path=root / "run_metrics.csv",
                    )

    def test_aa_seed_fails_when_prefetch_resolves_less_than_requested_count(self):
        candidates = [{"name": f"Model {idx}"} for idx in range(1, 50)]

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with (
                patch("scripts.seed_catalog.prefetch_candidates", return_value=candidates),
                patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
            ):
                with self.assertRaisesRegex(SeedCatalogError, "requested top 50"):
                    run_seed(
                        self._args(50),
                        db_path=db_path,
                        log_path=root / "seed.log",
                        changelogs_dir=root / "changelogs",
                        csv_path=root / "run_metrics.csv",
                    )

    def test_aa_seed_fails_when_final_unique_count_is_short(self):
        candidates = [{"name": "Model 1"}, {"name": "Model 1"}]

        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": [_sample_model("Model 1")],
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with (
                patch("scripts.seed_catalog.prefetch_candidates", return_value=candidates),
                patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
            ):
                with self.assertRaisesRegex(RunUpdateError, "unique Artificial Analysis models"):
                    run_seed(
                        self._args(2),
                        db_path=db_path,
                        log_path=root / "seed.log",
                        changelogs_dir=root / "changelogs",
                        csv_path=root / "run_metrics.csv",
                    )

    def test_prefetched_non_aa_presets_fail_when_source_resolves_less_than_requested_count(self):
        cases = [
            ("llmstats", "LLM Stats"),
            ("openrouter", "OpenRouter"),
            ("custom-endpoint", "Custom endpoint"),
        ]
        for preset, label in cases:
            with self.subTest(preset=preset):
                candidates = [{"name": "Model 1"}]
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    db_path = root / "dash.sqlite"
                    ensure_schema(db_path)
                    with (
                        patch("scripts.seed_catalog.prefetch_candidates", return_value=candidates),
                        patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                    ):
                        with self.assertRaisesRegex(SeedCatalogError, label):
                            run_seed(
                                self._args(2, preset=preset),
                                db_path=db_path,
                                log_path=root / "seed.log",
                                changelogs_dir=root / "changelogs",
                                csv_path=root / "run_metrics.csv",
                            )

    def test_agent_discovery_presets_fail_when_final_unique_count_is_short(self):
        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": [_sample_model("Model 1")],
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        for preset in ("exa", "custom-prompt"):
            with self.subTest(preset=preset):
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    db_path = root / "dash.sqlite"
                    ensure_schema(db_path)
                    with (
                        patch("scripts.seed_catalog.prefetch_candidates", return_value=[]),
                        patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                        patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
                    ):
                        with self.assertRaisesRegex(RunUpdateError, "requested top 2"):
                            run_seed(
                                self._args(2, preset=preset),
                                db_path=db_path,
                                log_path=root / "seed.log",
                                changelogs_dir=root / "changelogs",
                                csv_path=root / "run_metrics.csv",
                            )

    def test_agent_discovery_presets_retry_missing_unique_count_once(self):
        for preset in ("exa", "custom-prompt"):
            with self.subTest(preset=preset):
                calls: list[str] = []

                async def fake_score_batch(prompt, exa_key, log_path, db_path):
                    calls.append(prompt)
                    models = [_sample_model("Model 1")] if len(calls) == 1 else [_sample_model("Model 2")]
                    return (
                        {
                            "date": local_date(),
                            "title": "Catalog seed",
                            "summary": "Initial seed",
                            "new_models": models,
                            "score_updates": [],
                            "status_changes": [],
                        },
                        {"tokens_input": 1, "tokens_output": 1},
                        "test-agent",
                    )

                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    db_path = root / "dash.sqlite"
                    ensure_schema(db_path)
                    with (
                        patch("scripts.seed_catalog.prefetch_candidates", return_value=[]),
                        patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                        patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
                    ):
                        result = run_seed(
                            self._args(2, preset=preset),
                            db_path=db_path,
                            log_path=root / "seed.log",
                            changelogs_dir=root / "changelogs",
                            csv_path=root / "run_metrics.csv",
                        )

                self.assertEqual(result["models"], 2)
                self.assertEqual(len(calls), 2)
                self.assertIn("Recovery pass", calls[1])
                self.assertIn("Model 1", calls[1])

    def test_prefetched_non_aa_presets_fail_when_agent_returns_short_after_recovery(self):
        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": [_sample_model("Model 1")],
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        for preset in ("llmstats", "openrouter", "custom-endpoint"):
            with self.subTest(preset=preset):
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    db_path = root / "dash.sqlite"
                    ensure_schema(db_path)
                    with (
                        patch("scripts.seed_catalog.prefetch_candidates", return_value=[{"name": "Model 1"}, {"name": "Model 2"}]),
                        patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                        patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
                    ):
                        with self.assertRaisesRegex(RunUpdateError, "missing: Model 2"):
                            run_seed(
                                self._args(2, preset=preset),
                                db_path=db_path,
                                log_path=root / "seed.log",
                                changelogs_dir=root / "changelogs",
                                csv_path=root / "run_metrics.csv",
                            )

    def test_seed_fails_when_agent_returns_more_unique_models_than_requested(self):
        async def fake_score_batch(prompt, exa_key, log_path, db_path):
            return (
                {
                    "date": local_date(),
                    "title": "Catalog seed",
                    "summary": "Initial seed",
                    "new_models": [_sample_model("Model 1"), _sample_model("Model 2"), _sample_model("Model 3")],
                    "score_updates": [],
                    "status_changes": [],
                },
                {"tokens_input": 1, "tokens_output": 1},
                "test-agent",
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with (
                patch("scripts.seed_catalog.prefetch_candidates", return_value=[]),
                patch("scripts.seed_catalog.load_exa_api_key", return_value=""),
                patch("scripts.seed_catalog._score_batch", side_effect=fake_score_batch),
            ):
                with self.assertRaisesRegex(RunUpdateError, "returned 3 unique Exa models"):
                    run_seed(
                        self._args(2, preset="exa"),
                        db_path=db_path,
                        log_path=root / "seed.log",
                        changelogs_dir=root / "changelogs",
                        csv_path=root / "run_metrics.csv",
                    )

    def test_seed_rejects_out_of_range_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "dash.sqlite"
            ensure_schema(db_path)
            with self.assertRaisesRegex(SeedCatalogError, "between 1 and 100"):
                run_seed(
                    self._args(0, preset="exa"),
                    db_path=db_path,
                    log_path=root / "seed.log",
                    changelogs_dir=root / "changelogs",
                    csv_path=root / "run_metrics.csv",
                )


if __name__ == "__main__":
    unittest.main()
