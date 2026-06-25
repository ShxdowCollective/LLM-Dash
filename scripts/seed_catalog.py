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
        safe_rel_path,
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
        safe_rel_path,
        usage_metrics,
        utc_now,
        validate_update,
        write_log,
    )

SKILL_PATH = ROOT / "skill" / "SKILL.md"
BATCH_SIZE = 25
PREFETCHED_PRESETS = {"aa", "llmstats", "openrouter", "custom-endpoint"}
DISCOVERY_PRESETS = {"exa", "custom-prompt"}
PRESET_LABELS = {
    "aa": "Artificial Analysis",
    "llmstats": "LLM Stats",
    "openrouter": "OpenRouter",
    "custom-endpoint": "Custom endpoint",
    "exa": "Exa",
    "custom-prompt": "Custom prompt",
}
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
        # Counts (default 0, never None) so a multi-batch seed reports real
        # research volume in run_metrics + the changelog footer.
        "exa_searches": 0,
        "exa_fetches": 0,
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


def _model_key(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _dedupe_models(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for model in models:
        name = str(model.get("name") or "").strip()
        if not name:
            continue
        key = _model_key(name)
        if key in seen:
            continue
        seen.add(key)
        merged.append(model)
    return merged


def _missing_candidates(candidates: list[dict[str, Any]], models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    returned = {_model_key(model.get("name")) for model in models if isinstance(model, dict)}
    missing: list[dict[str, Any]] = []
    for candidate in candidates:
        name = candidate.get("name") or candidate.get("id") or ""
        if name and _model_key(name) not in returned:
            missing.append(candidate)
    return missing


def _missing_names(candidates: list[dict[str, Any]], limit: int = 8) -> str:
    names = [str(item.get("name") or item.get("id") or "").strip() for item in candidates]
    names = [name for name in names if name]
    shown = names[:limit]
    suffix = "" if len(names) <= limit else f", +{len(names) - limit} more"
    return ", ".join(shown) + suffix


def _candidate_key(candidate: dict[str, Any]) -> str:
    return _model_key(candidate.get("name") or candidate.get("id"))


def _append_unique_candidate(
    candidates: list[dict[str, Any]],
    seen: set[str],
    candidate: dict[str, Any],
    limit: int,
) -> None:
    if len(candidates) >= limit:
        return
    key = _candidate_key(candidate)
    if not key or key in seen:
        return
    seen.add(key)
    candidates.append(candidate)


def _preset_label(preset: str) -> str:
    return PRESET_LABELS.get(preset, preset)


def _require_prefetch_count(preset: str, requested_count: int, candidates: list[dict[str, Any]]) -> None:
    if preset not in PREFETCHED_PRESETS:
        return
    if len(candidates) >= requested_count:
        return
    label = _preset_label(preset)
    raise SeedCatalogError(
        f"{label} returned {len(candidates)} named candidates for requested top {requested_count}; "
        "seed not applied."
    )


def _require_final_count(preset: str, requested_count: int, models: list[dict[str, Any]]) -> None:
    if len(models) == requested_count:
        return
    label = _preset_label(preset)
    raise RunUpdateError(
        f"Seed agent returned {len(models)} unique {label} models for requested top {requested_count}; "
        "seed not applied."
    )


def _bounded_count(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise SeedCatalogError("Seed count must be an integer.") from exc
    if count < 1 or count > 100:
        raise SeedCatalogError("Seed count must be between 1 and 100.")
    return count


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

    ranked = sorted((m for m in models if isinstance(m, dict)), key=sort_key, reverse=True)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
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
        _append_unique_candidate(
            candidates,
            seen,
            {
                "name": item.get("name") or item.get("slug") or "",
                "vendor": vendor,
                "pricing": pricing_text,
                "performance": item.get("performance"),
                "priors": priors,
                "card_url": f"https://artificialanalysis.ai/models/{item.get('slug') or ''}".rstrip("/"),
                "source": "https://artificialanalysis.ai/",
            },
            count,
        )
    return candidates


def _fetch_llmstats_candidates(count: int) -> list[dict[str, Any]]:
    import httpx

    key = load_llmstats_api_key()
    if not key:
        raise SeedCatalogError("LLM Stats API key is not configured.")
    request_limit = min(max(count * 3, count), 100)
    with httpx.Client(timeout=30) as client:
        response = client.get(
            f"{LLMSTATS_BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            params={"limit": str(request_limit)},
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
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("id") or item.get("slug") or ""
        if name:
            _append_unique_candidate(candidates, seen, {"name": name, "source": "https://llm-stats.com/"}, count)
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
    ranked = sorted((m for m in items if isinstance(m, dict)), key=sort_key, reverse=True)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in ranked:
        model_id = item.get("id") or item.get("name") or ""
        if model_id:
            _append_unique_candidate(candidates, seen, {"name": model_id, "source": "https://openrouter.ai/models"}, count)
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
    items = data.get("data") or data.get("models") or [] if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise SeedCatalogError("Custom endpoint returned an unexpected /models payload shape.")
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("name") or ""
        if model_id:
            _append_unique_candidate(candidates, seen, {"name": model_id, "source": models_url}, count)
    return candidates


def _build_discovery_recovery_prompt(
    *,
    preset: str,
    count: int,
    index: str,
    prompt_text: str,
    skill_text: str,
    existing_models: list[dict[str, Any]],
) -> str:
    existing_names = [
        str(model.get("name") or "").strip()
        for model in existing_models
        if isinstance(model, dict) and str(model.get("name") or "").strip()
    ]
    prompt = build_seed_prompt(
        [],
        preset=preset,
        count=count,
        index=index,
        prompt_text=prompt_text,
        skill_text=skill_text,
        batch_index=1,
        batch_total=1,
    )
    prompt += (
        "\n\nRecovery pass: the previous discovery response returned fewer unique models than requested. "
        f"Return exactly {count} additional unique models in new_models."
    )
    if existing_names:
        prompt += "\n\nDo not repeat these already-scored models:\n" + json.dumps(existing_names, ensure_ascii=False, indent=2)
    return prompt


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


async def _score_batch_with_recovery(
    *,
    batch: list[dict[str, Any]],
    prompt: str,
    preset: str,
    index: str,
    skill_text: str,
    exa_key: str,
    log_path: Path,
    db_path: Path,
    batch_index: int,
    batch_total: int,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], str]:
    update, usage, agent_name = await _score_batch(prompt, exa_key, log_path, db_path)
    usages = [usage]
    batch_models = list(update.get("new_models") or [])
    if not batch:
        return update, batch_models, usages, agent_name

    missing = _missing_candidates(batch, batch_models)
    if not missing:
        return update, batch_models, usages, agent_name

    write_log(
        log_path,
        "seed_batch_incomplete "
        f"{batch_index}/{batch_total} returned={len(batch_models)} expected={len(batch)} "
        f"missing={json.dumps(_missing_names(missing), ensure_ascii=False)}",
    )
    retry_prompt = build_seed_prompt(
        missing,
        preset=preset,
        count=len(missing),
        index=index,
        prompt_text="",
        skill_text=skill_text,
        batch_index=batch_index,
        batch_total=batch_total,
    )
    retry_prompt += (
        "\n\nRecovery pass: the previous batch response omitted these candidate models. "
        "Score EVERY listed model below. Return ONLY the missing models in new_models."
    )
    retry_update, retry_usage, agent_name = await _score_batch(retry_prompt, exa_key, log_path, db_path)
    usages.append(retry_usage)
    retry_models = list(retry_update.get("new_models") or [])
    batch_models = _dedupe_models(batch_models + retry_models)
    missing = _missing_candidates(batch, batch_models)
    if missing:
        raise RunUpdateError(
            f"Seed agent returned {len(batch_models)} of {len(batch)} requested candidates "
            f"for batch {batch_index}/{batch_total}; missing: {_missing_names(missing)}"
        )
    return update, batch_models, usages, agent_name


def run_seed(
    args: argparse.Namespace,
    *,
    db_path: Path,
    log_path: Path,
    changelogs_dir: Path,
    csv_path: Path,
) -> dict[str, Any]:
    args.count = _bounded_count(args.count)
    skill_text = SKILL_PATH.read_text(encoding="utf-8")
    exa_key = load_exa_api_key()
    write_log(
        log_path,
        f"seed_prepare preset={args.preset} count={args.count} index={args.index or 'intelligence'}",
    )
    candidates = prefetch_candidates(args)
    write_log(log_path, f"seed_candidates resolved={len(candidates)}")
    _require_prefetch_count(args.preset, args.count, candidates)
    batches = _chunk_batches(candidates, args.count, args.preset)
    batch_total = len(batches)
    write_log(log_path, f"seed_plan batches={batch_total} batch_size={BATCH_SIZE}")

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
        total_candidates = len(candidates) if candidates else args.count
        batch_candidates = batch or [
            {"name": f"agent-discovered model {idx}"}
            for idx in range(1, args.count + 1)
        ]
        for item_idx, candidate in enumerate(batch_candidates, start=1):
            global_idx = ((batch_idx - 1) * BATCH_SIZE) + item_idx if candidates else item_idx
            model_name = str(candidate.get("name") or candidate.get("id") or f"candidate {global_idx}")
            write_log(
                log_path,
                f"seed_scoring_candidate {global_idx}/{total_candidates} name={json.dumps(model_name, ensure_ascii=False)}",
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
        update, batch_models, batch_usages, agent_name = asyncio.run(
            _score_batch_with_recovery(
                batch=batch,
                prompt=prompt,
                preset=args.preset,
                index=args.index or "intelligence",
                skill_text=skill_text,
                exa_key=exa_key,
                log_path=log_path,
                db_path=db_path,
                batch_index=batch_idx,
                batch_total=batch_total,
            )
        )
        usages.extend(batch_usages)
        merged_models = _dedupe_models(merged_models + list(batch_models))
        write_log(
            log_path,
            f"seed_batch_complete {batch_idx}/{batch_total} models={len(batch_models)} total_models={len(merged_models)}",
        )
        if update.get("title"):
            title = str(update["title"])
        if update.get("summary"):
            summary = str(update["summary"])

    if args.preset in DISCOVERY_PRESETS and len(merged_models) < args.count:
        remaining = args.count - len(merged_models)
        write_log(
            log_path,
            f"seed_discovery_incomplete returned={len(merged_models)} expected={args.count} retrying={remaining}",
        )
        retry_prompt = _build_discovery_recovery_prompt(
            preset=args.preset,
            count=remaining,
            index=args.index or "intelligence",
            prompt_text=args.prompt,
            skill_text=skill_text,
            existing_models=merged_models,
        )
        retry_update, retry_usage, agent_name = asyncio.run(
            _score_batch(retry_prompt, exa_key, log_path, db_path)
        )
        usages.append(retry_usage)
        retry_models = list(retry_update.get("new_models") or [])
        merged_models = _dedupe_models(merged_models + retry_models)
        write_log(
            log_path,
            f"seed_discovery_retry_complete models={len(retry_models)} total_models={len(merged_models)}",
        )
        if retry_update.get("title"):
            title = str(retry_update["title"])
        if retry_update.get("summary"):
            summary = str(retry_update["summary"])

    _require_final_count(args.preset, args.count, merged_models)

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
    write_log(log_path, f"seed_apply models={len(merged_models)}")
    validate_update(final_update, db_path)
    return {
        "update": final_update,
        "usage": _sum_usage(usages),
        "agent_name": agent_name,
        "models": len(merged_models),
    }


def dry_run_plan(args: argparse.Namespace) -> None:
    args.count = _bounded_count(args.count)
    skill_text = SKILL_PATH.read_text(encoding="utf-8")
    try:
        candidates = prefetch_candidates(args)
    except SeedCatalogError as exc:
        if args.preset in ("exa", "custom-prompt"):
            candidates = []
        else:
            raise
    _require_prefetch_count(args.preset, args.count, candidates)
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
            "notes": f"Seed run preset={args.preset}. Log: {safe_rel_path(log_path)}",
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
