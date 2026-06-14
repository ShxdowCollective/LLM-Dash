#!/usr/bin/env python3
"""Seed the LLM-Dash model catalog via the research agent."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import traceback
from pathlib import Path
from typing import Any

try:
    from scripts.config import (
        AA_BASE_URL,
        ConfigError,
        LLMSTATS_BASE_URL,
        load_aa_api_key,
        load_exa_api_key,
        load_llmstats_api_key,
        load_provider_bundle,
    )
    from scripts.init_db import ensure_schema
    from scripts.run_update import (
        AGENT_RUNTIME,
        CHANGELOGS_DIR,
        DB_PATH,
        ROOT,
        RunUpdateError,
        apply_update,
        iso_z,
        local_date,
        parse_json_output,
        run_agent_once,
        usage_metrics,
        utc_now,
        validate_update,
        write_log,
    )
except ModuleNotFoundError:
    from config import (  # type: ignore
        AA_BASE_URL,
        ConfigError,
        LLMSTATS_BASE_URL,
        load_aa_api_key,
        load_exa_api_key,
        load_llmstats_api_key,
        load_provider_bundle,
    )
    from init_db import ensure_schema  # type: ignore
    from run_update import (  # type: ignore
        AGENT_RUNTIME,
        CHANGELOGS_DIR,
        DB_PATH,
        ROOT,
        RunUpdateError,
        apply_update,
        iso_z,
        local_date,
        parse_json_output,
        run_agent_once,
        usage_metrics,
        utc_now,
        validate_update,
        write_log,
    )

SKILL_PATH = ROOT / "skill" / "SKILL.md"
BATCH_SIZE = 25
AA_INDEX_FIELDS = {
    "intelligence": "artificial_analysis_intelligence_index",
    "coding": "artificial_analysis_coding_index",
    "agentic": "artificial_analysis_agentic_index",
}
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


class SeedCatalogError(RuntimeError):
    pass


def _sum_usage(usages: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, Any] = {
        "tokens_input": None,
        "tokens_output": None,
        "tokens_cached": None,
        "cost_usd": None,
    }
    for usage in usages:
        for key in totals:
            value = usage.get(key)
            if value is None:
                continue
            if key == "cost_usd":
                totals[key] = (totals[key] or 0.0) + float(value)
            else:
                totals[key] = (totals[key] or 0) + int(value)
    return totals


def _dedupe_models(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for model in models:
        name = str(model.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(model)
    return merged


def _chunk_batches(candidates: list[dict[str, Any]], count: int, preset: str) -> list[list[dict[str, Any]]]:
    if preset in ("exa", "custom-prompt"):
        return [[]]
    if not candidates:
        return [[]]
    return [candidates[i : i + BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]


def build_seed_prompt(
    candidates: list[dict[str, Any]],
    *,
    preset: str,
    count: int,
    index: str,
    prompt_text: str,
    skill_text: str,
    batch_index: int,
    batch_total: int,
) -> str:
    parts = [
        "Build the LLM-Dash model catalog from scratch.",
        "Score EVERY listed candidate model on the LLM-Dash 0–10 rubric from SKILL.md "
        "(intelligence, coding, agents, speed, cost).",
        "Return JSON only with keys: date, title, summary, new_models, score_updates, status_changes.",
        "Put ALL scored models in new_models (each with name, vendor, color, released, params, pricing, "
        "notes, card_url, input_capabilities, and the five 0–10 scores).",
        "Set score_updates and status_changes to empty arrays.",
        "Cite a source URL in each model's notes.",
        f"Preset: {preset}",
        f"Target model count: {count}",
        f"Batch: {batch_index}/{batch_total}",
    ]
    if preset == "aa":
        parts.append(f"Ranking index: {AA_INDEX_FIELDS.get(index, AA_INDEX_FIELDS['intelligence'])}")
    if preset == "custom-prompt" and prompt_text:
        parts.append("Discovery brief:")
        parts.append(prompt_text)
    if candidates:
        parts.append("Candidate models (with priors where available):")
        parts.append(json.dumps(candidates, ensure_ascii=False, indent=2))
    elif preset in ("exa", "custom-prompt"):
        parts.append(
            f"No prefetched candidates — discover and score the top {count} current LLM models "
            "using Exa research and primary sources."
        )
    parts.append("SKILL.md scoring rubric:")
    parts.append(skill_text)
    return "\n\n".join(parts)


def _fetch_aa_candidates(index: str, count: int) -> list[dict[str, Any]]:
    import httpx

    key = load_aa_api_key()
    if not key:
        raise SeedCatalogError("Artificial Analysis API key is not configured.")
    field = AA_INDEX_FIELDS.get(index, AA_INDEX_FIELDS["intelligence"])
    with httpx.Client(timeout=30) as client:
        response = client.get(
            f"{AA_BASE_URL}/language/models/free",
            headers={"x-api-key": key, "Accept": "application/json"},
        )
    if response.status_code == 429:
        raise SeedCatalogError("Artificial Analysis API rate limit exceeded (429). Try again later.")
    if response.status_code != 200:
        raise SeedCatalogError(
            f"Artificial Analysis API returned HTTP {response.status_code}: {response.text[:300]}"
        )
    payload = response.json()
    models = payload if isinstance(payload, list) else payload.get("data") or payload.get("models") or []
    if not isinstance(models, list):
        raise SeedCatalogError("Artificial Analysis API returned an unexpected payload shape.")

    def sort_key(item: dict[str, Any]) -> float:
        try:
            return float(item.get(field) or 0)
        except (TypeError, ValueError):
            return 0.0

    ranked = sorted((m for m in models if isinstance(m, dict)), key=sort_key, reverse=True)[:count]
    candidates: list[dict[str, Any]] = []
    for item in ranked:
        creator = item.get("model_creator") or {}
        vendor = creator.get("name") if isinstance(creator, dict) else str(creator or "")
        pricing = item.get("pricing")
        if isinstance(pricing, dict):
            pricing_text = pricing
        else:
            pricing_text = pricing
        priors = {
            "artificial_analysis_intelligence_index": item.get("artificial_analysis_intelligence_index"),
            "artificial_analysis_coding_index": item.get("artificial_analysis_coding_index"),
            "artificial_analysis_agentic_index": item.get("artificial_analysis_agentic_index"),
        }
        candidates.append(
            {
                "name": item.get("name") or item.get("slug") or "",
                "vendor": vendor,
                "pricing": pricing_text,
                "performance": item.get("performance"),
                "priors": priors,
                "card_url": f"https://artificialanalysis.ai/models/{item.get('slug') or ''}".rstrip("/"),
                "source": "https://artificialanalysis.ai/",
            }
        )
    return [c for c in candidates if c.get("name")]


def _fetch_llmstats_candidates(count: int) -> list[dict[str, Any]]:
    import httpx

    key = load_llmstats_api_key()
    if not key:
        raise SeedCatalogError("LLM Stats API key is not configured.")
    with httpx.Client(timeout=30) as client:
        response = client.get(
            f"{LLMSTATS_BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            params={"limit": str(count)},
        )
    if response.status_code != 200:
        raise SeedCatalogError(
            f"LLM Stats API returned HTTP {response.status_code}: {response.text[:300]}"
        )
    data = response.json()
    items = data.get("data") or data.get("models") or [] if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise SeedCatalogError("LLM Stats API returned an unexpected payload shape.")
    candidates: list[dict[str, Any]] = []
    for item in items[:count]:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("id") or item.get("slug") or ""
        if name:
            candidates.append({"name": name, "source": "https://llm-stats.com/"})
    return candidates


def _fetch_openrouter_candidates(count: int) -> list[dict[str, Any]]:
    import httpx

    headers = {"Accept": "application/json"}
    bundle = load_provider_bundle()
    if bundle.secrets.api_key and "openrouter" in (bundle.config.base_url or "").lower():
        headers["Authorization"] = f"Bearer {bundle.secrets.api_key}"
    with httpx.Client(timeout=30) as client:
        response = client.get(OPENROUTER_MODELS_URL, headers=headers)
    if response.status_code != 200:
        raise SeedCatalogError(
            f"OpenRouter API returned HTTP {response.status_code}: {response.text[:300]}"
        )
    data = response.json()
    items = data.get("data") or [] if isinstance(data, dict) else []
    if not isinstance(items, list):
        raise SeedCatalogError("OpenRouter API returned an unexpected payload shape.")

    def sort_key(item: dict[str, Any]) -> tuple[int, str]:
        ctx = item.get("context_length") or item.get("top_provider", {}).get("context_length") or 0
        try:
            ctx_val = int(ctx)
        except (TypeError, ValueError):
            ctx_val = 0
        created = str(item.get("created") or "")
        return (ctx_val, created)

    # OpenRouter exposes no popularity ranking on /models, so we proxy "top" by
    # largest context window then recency. The agent re-scores from primary
    # sources regardless, so this only shapes which N candidates are considered.
    ranked = sorted((m for m in items if isinstance(m, dict)), key=sort_key, reverse=True)[:count]
    candidates: list[dict[str, Any]] = []
    for item in ranked:
        model_id = item.get("id") or item.get("name") or ""
        if model_id:
            candidates.append({"name": model_id, "source": "https://openrouter.ai/models"})
    return candidates


def _read_custom_endpoint_bearer(credential_name: str) -> str:
    try:
        from scripts import voidware_auth
    except ModuleNotFoundError:
        import voidware_auth  # type: ignore

    name = str(credential_name or "").strip()
    if name:
        try:
            secret = str(voidware_auth.read_secret_with_grant(name).get("secret") or "")
            if secret:
                return secret
        except Exception:
            pass
    bundle = load_provider_bundle()
    return bundle.secrets.api_key


def _fetch_custom_endpoint_candidates(endpoint: str, credential: str, count: int) -> list[dict[str, Any]]:
    import httpx

    base = endpoint.rstrip("/")
    if not base:
        raise SeedCatalogError("Custom endpoint URL is required for custom-endpoint preset.")
    bearer = _read_custom_endpoint_bearer(credential)
    headers = {"Accept": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    models_url = f"{base}/models" if not base.endswith("/models") else base
    with httpx.Client(timeout=30) as client:
        response = client.get(models_url, headers=headers)
    if response.status_code != 200:
        raise SeedCatalogError(
            f"Custom endpoint returned HTTP {response.status_code}: {response.text[:300]}"
        )
    data = response.json()
    items = data.get("data") or [] if isinstance(data, dict) else []
    if not isinstance(items, list):
        raise SeedCatalogError("Custom endpoint returned an unexpected /models payload shape.")
    candidates: list[dict[str, Any]] = []
    for item in items[:count]:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("name") or ""
        if model_id:
            candidates.append({"name": model_id, "source": models_url})
    return candidates


def prefetch_candidates(args: argparse.Namespace) -> list[dict[str, Any]]:
    preset = args.preset
    if preset == "aa":
        return _fetch_aa_candidates(args.index or "intelligence", args.count)
    if preset == "llmstats":
        return _fetch_llmstats_candidates(args.count)
    if preset == "openrouter":
        return _fetch_openrouter_candidates(args.count)
    if preset == "custom-endpoint":
        return _fetch_custom_endpoint_candidates(args.endpoint, args.credential, args.count)
    return []


async def _score_batch(
    prompt: str,
    exa_key: str,
    log_path: Path,
    db_path: Path,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    bundle = load_provider_bundle()
    if not bundle.has_provider:
        raise ConfigError("Agent Provider requires base_url, api_key, and default_model.")
    errors: list[str] = []
    for model_name in [bundle.config.default_model, bundle.config.backup_model]:
        if not model_name:
            continue
        try:
            output, usage = await run_agent_once(model_name, prompt, exa_key, log_path)
            update = parse_json_output(output)
            validate_update(update, db_path)
            return update, usage, model_name
        except Exception as exc:
            errors.append(f"{model_name}: {type(exc).__name__}: {exc}")
            write_log(log_path, f"seed_agent_error model={model_name} error={type(exc).__name__}: {exc}")
    raise RunUpdateError("All configured models failed: " + " | ".join(errors))


def run_seed(
    args: argparse.Namespace,
    *,
    db_path: Path,
    log_path: Path,
    changelogs_dir: Path,
    csv_path: Path,
) -> dict[str, Any]:
    skill_text = SKILL_PATH.read_text(encoding="utf-8")
    exa_key = load_exa_api_key()
    candidates = prefetch_candidates(args)
    batches = _chunk_batches(candidates, args.count, args.preset)
    batch_total = len(batches)

    merged_models: list[dict[str, Any]] = []
    usages: list[dict[str, Any]] = []
    agent_name = "seed-agent"
    title = ""
    summary = ""

    for batch_idx, batch in enumerate(batches, start=1):
        scoring_count = len(batch) if batch else args.count
        write_log(
            log_path,
            f"seed_batch {batch_idx}/{batch_total} scoring {scoring_count} models",
        )
        prompt = build_seed_prompt(
            batch,
            preset=args.preset,
            count=args.count if not batch else len(batch),
            index=args.index or "intelligence",
            prompt_text=args.prompt,
            skill_text=skill_text,
            batch_index=batch_idx,
            batch_total=batch_total,
        )
        update, usage, agent_name = asyncio.run(
            _score_batch(prompt, exa_key, log_path, db_path)
        )
        usages.append(usage)
        batch_models = update.get("new_models") or []
        merged_models = _dedupe_models(merged_models + list(batch_models))
        if update.get("title"):
            title = str(update["title"])
        if update.get("summary"):
            summary = str(update["summary"])

    if not merged_models:
        raise RunUpdateError("Seed agent returned no models.")

    # Single apply at the end (not per batch) so exactly one changelog +
    # run_metrics row is written for today — per-batch apply_update would
    # overwrite the date's row each time (ON CONFLICT(date)). Trade-off: a
    # late-batch agent failure loses earlier batches, so the whole seed must be
    # retried. Acceptable because preset counts are capped (<=100, batches of
    # 25) and the wizard offers a one-click retry + a CLI escape hatch.
    date_value = local_date()
    if not title:
        title = f"Catalog seed — {date_value}"
    if not summary:
        summary = f"Initial catalog seed via preset={args.preset} ({len(merged_models)} models)."

    final_update = {
        "date": date_value,
        "title": title,
        "summary": summary,
        "new_models": merged_models,
        "score_updates": [],
        "status_changes": [],
    }
    validate_update(final_update, db_path)
    return {
        "update": final_update,
        "usage": _sum_usage(usages),
        "agent_name": agent_name,
        "models": len(merged_models),
    }


def dry_run_plan(args: argparse.Namespace) -> None:
    skill_text = SKILL_PATH.read_text(encoding="utf-8")
    try:
        candidates = prefetch_candidates(args)
    except SeedCatalogError as exc:
        if args.preset in ("exa", "custom-prompt"):
            candidates = []
        else:
            raise
    batches = _chunk_batches(candidates, args.count, args.preset)
    prompt = build_seed_prompt(
        batches[0] if batches else [],
        preset=args.preset,
        count=args.count,
        index=args.index or "intelligence",
        prompt_text=args.prompt,
        skill_text=skill_text,
        batch_index=1,
        batch_total=len(batches),
    )
    print(f"Resolved candidate count: {len(candidates)}")
    print(f"Batch plan: {len(batches)} batch(es) of up to {BATCH_SIZE} models")
    print("Prompt preview (first 1000 chars):")
    print(prompt[:1000])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--preset",
        choices=("aa", "llmstats", "exa", "openrouter", "custom-prompt", "custom-endpoint"),
        required=True,
    )
    parser.add_argument("--count", type=int, default=25)
    parser.add_argument("--index", default="intelligence", help="AA ranking index")
    parser.add_argument("--prompt", default="", help="Custom discovery brief")
    parser.add_argument("--endpoint", default="", help="Custom OpenAI-compatible base URL")
    parser.add_argument("--credential", default="", help="Saved credential name for custom-endpoint")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--log-path", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log_path = Path(args.log_path) if args.log_path else ROOT / "logs" / "seed-catalog.log"
    db_path = Path(args.db_path)
    changelogs_dir = CHANGELOGS_DIR if db_path.resolve() == DB_PATH.resolve() else db_path.parent / "changelogs"
    csv_path = ROOT / "data" / "run_metrics.csv" if db_path.resolve() == DB_PATH.resolve() else db_path.parent / "run_metrics.csv"

    started = utc_now()
    start_time = time.monotonic()
    write_log(log_path, "seed_start")
    try:
        if args.dry_run:
            dry_run_plan(args)
            write_log(log_path, "seed_complete dry_run=true")
            return 0

        ensure_schema(db_path)
        result = run_seed(
            args,
            db_path=db_path,
            log_path=log_path,
            changelogs_dir=changelogs_dir,
            csv_path=csv_path,
        )
        completed = utc_now()
        metrics = {
            "started_at": iso_z(started),
            "completed_at": iso_z(completed),
            "duration_sec": round(time.monotonic() - start_time, 3),
            "agent_name": result["agent_name"],
            "agent_runtime": AGENT_RUNTIME,
            "exa_searches": 0,
            "exa_fetches": 0,
            "notes": f"Seed run preset={args.preset}. Log: {log_path.relative_to(ROOT).as_posix()}",
            **result["usage"],
        }
        apply_update(
            result["update"],
            metrics,
            db_path,
            log_path,
            changelogs_dir,
            csv_path,
        )
        write_log(log_path, "seed_complete")
        print(
            json.dumps(
                {
                    "ok": True,
                    "date": result["update"]["date"],
                    "models": result["models"],
                },
                indent=2,
            )
        )
        return 0
    except (ConfigError, RunUpdateError, SeedCatalogError) as exc:
        write_log(log_path, f"seed_error {type(exc).__name__}: {exc}")
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        write_log(log_path, "seed_error " + traceback.format_exc().replace("\n", " | "))
        print(f"error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
