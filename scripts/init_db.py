#!/usr/bin/env python3
"""Seed data/dash.sqlite with the 34-model bootstrap dataset and
changelogs/2026-04-20.md. Idempotent via --force.

Mirrors references/llm-benchmark-dashboard.jsx (Apr 16, 2026 snapshot).
Bootstrap run_metrics row uses agent='bootstrap' / runtime='init-script'
so the Stats page has something to render on day 1.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Data and changelog roots are env-overridable so an isolated harness (e2e tests)
# can seed a throwaway dir without touching the real, append-only state. Matches
# the same overrides honored by server.py.
DATA_DIR = Path(os.environ.get("LLM_DASH_DATA_DIR") or (ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "dash.sqlite"
SCHEMA_PATH = ROOT / "scripts" / "schema.sql"
CSV_PATH = DATA_DIR / "run_metrics.csv"
CHANGELOGS_DIR = Path(
    os.environ.get("LLM_DASH_CHANGELOGS_DIR") or (ROOT / "changelogs")
).resolve()

SEED_DATE = "2026-04-20"
SEED_TITLE = "April 20, 2026"
SCHEMA_VERSION = "4"
SEED_VERSION = "1"

# Fixed input-modality vocabulary (schema_version 4). Stored as canonical JSON
# text on models.input_capabilities, e.g. '["text","image"]'. Default ["text"].
CAPABILITY_VOCAB = ("text", "image", "audio", "video")


def canonical_capabilities(value) -> str:
    """Sorted, unique, vocabulary-checked JSON text. Defaults to ["text"]."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    items = [str(v).strip().lower() for v in (value or [])]
    keep = [c for c in CAPABILITY_VOCAB if c in items]
    if "text" not in keep:
        keep = ["text"] + keep
    # Preserve vocabulary order (text, image, audio, video) for stable display.
    ordered = [c for c in CAPABILITY_VOCAB if c in keep]
    return json.dumps(ordered)

# Vendor-level documentation fallback when a seed model has no explicit
# `card_url`. Researched per-model card URLs live on individual MODELS entries.
VENDOR_CARD_URL: dict[str, str] = {
    "OpenAI": "https://platform.openai.com/docs/models",
    "Anthropic": "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    "Google": "https://ai.google.dev/gemini-api/docs/models",
    "Alibaba": "https://qwenlm.github.io/blog/",
    "MiniMax": "https://platform.minimax.io/docs/guides/text-generation",
    "Zhipu AI (Z.ai)": "https://docs.z.ai/guides/llm/glm-4.6",
    "Moonshot AI": "https://platform.moonshot.ai/docs/introduction",
    "NVIDIA": "https://build.nvidia.com/nvidia",
    "Xiaomi": "https://huggingface.co/XiaomiMiMo",
    "xAI": "https://docs.x.ai/docs/models",
}

SOURCE_NOTE = (
    "references/llm-benchmark-dashboard.jsx — Apr 16, 2026 seed snapshot. "
    "Sources: Artificial Analysis Intelligence Index v4.0, SWE-bench "
    "Verified/Pro, Terminal-Bench 2.0, OSWorld-Verified, PinchBench, "
    "ClawEval, GPQA Diamond, official model cards, OpenRouter, Vals AI, "
    "vendor technical reports."
)

MODELS: list[dict] = [
    {"name": "GPT-5.4", "vendor": "OpenAI", "color": "#10a37f", "released": "Mar 5, 2026", "params": "Proprietary", "pricing": "$2.50 / $15.00", "intelligence": 9.5, "coding": 9.3, "agents": 9.4, "speed": 6.5, "cost": 5.5, "card_url": "https://developers.openai.com/api/docs/models/gpt-5.4", "input_capabilities": ["text", "image"], "notes": "AA Index 57 (tied #1). GDPval-AA 83%. SWE-Pro 57.7%. OSWorld record. 1M ctx."},
    {"name": "GPT-5.4 mini", "vendor": "OpenAI", "color": "#10a37f", "released": "Mar 17, 2026", "params": "Proprietary", "pricing": "$0.75 / $4.50", "intelligence": 8.5, "coding": 8.4, "agents": 8.2, "speed": 8.0, "cost": 7.5, "card_url": "https://developers.openai.com/api/docs/models/gpt-5.4-mini", "input_capabilities": ["text", "image"], "notes": "GPQA 88%. SWE-Pro 54.4%. OSWorld 72.1%. 2x faster than predecessor. 400K ctx."},
    {"name": "GPT-5.4 nano", "vendor": "OpenAI", "color": "#10a37f", "released": "Mar 17, 2026", "params": "Proprietary", "pricing": "$0.20 / $1.25", "intelligence": 4.4, "coding": 4.5, "agents": 4.2, "speed": 9.5, "cost": 9.5, "card_url": "https://developers.openai.com/api/docs/models/gpt-5.4-nano", "input_capabilities": ["text", "image"], "notes": "OSWorld 39%. Term-Bench 46.3%. Cheapest in GPT-5.4 family. API-only."},
    {"name": "Claude Sonnet 4.6", "vendor": "Anthropic", "color": "#d4a27f", "released": "Feb 2026", "params": "Proprietary", "pricing": "$3.00 / $15.00", "intelligence": 9.1, "coding": 9.0, "agents": 8.5, "speed": 7.0, "cost": 5.5, "card_url": "https://platform.claude.com/docs/en/about-claude/models/claude-sonnet-4-6", "input_capabilities": ["text", "image"], "notes": "AA Index 52. SWE-Verified 79.6%. 1M ctx beta. Adaptive reasoning."},
    {"name": "Claude Opus 4.7", "vendor": "Anthropic", "color": "#d4a27f", "released": "Apr 16, 2026", "params": "Proprietary", "pricing": "$5.00 / $25.00", "intelligence": 9.4, "coding": 9.7, "agents": 9.5, "speed": 5.0, "cost": 3.5, "card_url": "https://platform.claude.com/docs/en/about-claude/models/claude-opus-4-7", "input_capabilities": ["text", "image"], "notes": "NEW TODAY. SWE-V 87.6% (#1 GA). SWE-Pro 64.3%. GPQA 94.2%. OSWorld 78%. MCP-Atlas 77.3% (#1). 3x vision resolution (2576px). xhigh effort level. Self-verification. Multi-agent coordination. Terminal-Bench 69.4% (regression vs GPT-5.4's 75.1%). 1M ctx."},
    {"name": "Claude Opus 4.6", "vendor": "Anthropic", "color": "#d4a27f", "released": "Jan 2026", "params": "Proprietary", "pricing": "$5.00 / $25.00", "intelligence": 9.3, "coding": 9.2, "agents": 9.2, "speed": 5.0, "cost": 3.5, "card_url": "https://platform.claude.com/docs/en/about-claude/models/claude-opus-4-6", "input_capabilities": ["text", "image"], "notes": "Superseded by Opus 4.7 today. AA Index 53. SWE-V 80.8%. ClawEval 66.3. Being replaced in model pickers.", "status": "superseded"},
    {"name": "Claude 4.5 Haiku", "vendor": "Anthropic", "color": "#d4a27f", "released": "Oct 2025", "params": "Proprietary", "pricing": "$1.00 / $5.00", "intelligence": 6.7, "coding": 7.7, "agents": 6.5, "speed": 8.5, "cost": 7.0, "card_url": "https://platform.claude.com/docs/en/about-claude/models/claude-haiku-4-5", "input_capabilities": ["text", "image"], "notes": "Fast budget model. Strong for size. 200K ctx. Good coding/price ratio."},
    {"name": "Gemini 3.1 Pro", "vendor": "Google", "color": "#4285f4", "released": "Feb 19, 2026", "params": "Proprietary MoE", "pricing": "$2.00 / $12.00", "intelligence": 9.5, "coding": 9.2, "agents": 9.0, "speed": 7.5, "cost": 6.0, "card_url": "https://deepmind.google/models/model-cards/gemini-3-1-pro/", "input_capabilities": ["text", "image", "audio", "video"], "notes": "AA Index 57 (tied #1). GPQA 94.3%. SWE-V 80.6%. Term-Bench 78.4% (#1). 1M ctx."},
    {"name": "Gemini 3 Flash", "vendor": "Google", "color": "#4285f4", "released": "Dec 2025", "params": "Proprietary", "pricing": "$0.50 / $3.00", "intelligence": 7.0, "coding": 7.2, "agents": 7.0, "speed": 9.0, "cost": 8.0, "card_url": "https://deepmind.google/models/model-cards/gemini-3-flash/", "input_capabilities": ["text", "image", "audio", "video"], "notes": "Excellent speed/quality ratio. 1M ctx. Strong coding. Beats many larger models."},
    {"name": "Gemini 3.1 Flash-Lite", "vendor": "Google", "color": "#4285f4", "released": "Mar 9, 2026", "params": "Proprietary (distilled)", "pricing": "$0.25 / $1.00", "intelligence": 5.3, "coding": 5.5, "agents": 4.5, "speed": 9.8, "cost": 9.5, "card_url": "https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/", "input_capabilities": ["text", "image", "audio", "video"], "notes": "Ultra-cheap. 3200 t/s. 1M ctx at budget pricing. Beats GPT-5 mini on coding."},
    {"name": "MiniMax M2.5", "vendor": "MiniMax", "color": "#ff6b35", "released": "Feb 2026", "params": "230B / 10B active", "pricing": "$0.16 / $0.80", "intelligence": 7.5, "coding": 9.1, "agents": 7.5, "speed": 7.0, "cost": 9.0, "card_url": "https://huggingface.co/MiniMaxAI/MiniMax-M2.5", "notes": "SWE-Verified 80.2% (#1 open-weight). 230B MoE / 10B active. MIT license."},
    {"name": "MiniMax M2.7", "vendor": "MiniMax", "color": "#ff6b35", "released": "Mar 17, 2026", "params": "~230B MoE", "pricing": "$0.20 / $1.00", "intelligence": 8.1, "coding": 8.5, "agents": 7.8, "speed": 6.8, "cost": 8.5, "card_url": "https://huggingface.co/MiniMaxAI/MiniMax-M2.7", "notes": "Vals Index 59.58%. SWE-Pro 56.22% (self-reported). Big jump over M2.5."},
    {"name": "Qwen3.5-397B", "vendor": "Alibaba", "color": "#6236ff", "released": "Feb 2026", "params": "397B / 17B active", "pricing": "~$0.50 / $2.00", "intelligence": 7.9, "coding": 8.6, "agents": 7.5, "speed": 6.0, "cost": 8.0, "card_url": "https://huggingface.co/Qwen/Qwen3.5-397B-A17B", "input_capabilities": ["text", "image", "video"], "notes": "AA Index 45. GPQA 87.4%. LiveCodeBench 85.3%. 991K ctx. Open-weight."},
    {"name": "Qwen3.5-397B Thinking", "vendor": "Alibaba", "color": "#6236ff", "released": "Feb 2026", "params": "397B / 17B active", "pricing": "~$0.50 / $2.00", "intelligence": 8.2, "coding": 8.8, "agents": 7.8, "speed": 5.0, "cost": 7.5, "card_url": "https://huggingface.co/Qwen/Qwen3.5-397B-A17B", "input_capabilities": ["text", "image", "video"], "notes": "Thinking variant. Higher reasoning scores. More tokens consumed per query."},
    {"name": "Qwen3.5-122B Thinking", "vendor": "Alibaba", "color": "#6236ff", "released": "Feb 2026", "params": "122B / 10B active", "pricing": "~$0.30 / $1.20", "intelligence": 7.4, "coding": 7.5, "agents": 6.8, "speed": 7.5, "cost": 8.5, "card_url": "https://huggingface.co/Qwen/Qwen3.5-122B-A10B", "input_capabilities": ["text", "image", "video"], "notes": "Compact MoE. Comparable to Nemotron 3 Super. GPQA 84.2% (Qwen3.5-35B ref)."},
    {"name": "Qwen3-Coder-Next", "vendor": "Alibaba", "color": "#6236ff", "released": "Feb 2026", "params": "80B / 3B active", "pricing": "~$0.15 / $0.60", "intelligence": 5.6, "coding": 8.0, "agents": 6.0, "speed": 8.5, "cost": 9.5, "card_url": "https://huggingface.co/Qwen/Qwen3-Coder-Next", "notes": "70.6% SWE-V with 3B active params. SecCodeBench 61.2%. Runnable locally."},
    {"name": "Qwen3.6 Plus", "vendor": "Alibaba", "color": "#6236ff", "released": "Mar 30, 2026", "params": "Proprietary (hybrid arch)", "pricing": "$0.325 / $1.95 (free preview available)", "intelligence": 8.8, "coding": 8.9, "agents": 8.5, "speed": 6.5, "cost": 8.5, "card_url": "https://qwen.ai/blog?id=qwen3.6", "input_capabilities": ["text", "image", "video"], "notes": "AA Index 50. SWE-V 78.8%. Term-Bench 61.6%. MCPMark 48.2% (#1 tool-calling). 1M ctx. Always-on CoT. $0.325/$1.95 paid, free preview on OpenRouter. OmniDocBench 91.2 (#1)."},
    {"name": "Qwen3.6-35B-A3B", "vendor": "Alibaba", "color": "#6236ff", "released": "Apr 16, 2026", "params": "35B / 3B active", "pricing": "$0.07 / $0.14 (open-weight)", "intelligence": 7.6, "coding": 8.2, "agents": 7.8, "speed": 8.5, "cost": 9.5, "card_url": "https://huggingface.co/Qwen/Qwen3.6-35B-A3B", "input_capabilities": ["text", "image", "video"], "notes": "Open-weight 35B MoE / 3B active. Agentic coding focused. Thinking preservation. 262K ctx (1M ext). Apache 2.0. ~$0.07/$0.14 via providers."},
    {"name": "GLM-5 Thinking", "vendor": "Zhipu AI (Z.ai)", "color": "#00b4d8", "released": "Feb 11, 2026", "params": "744B / 40B active", "pricing": "$1.00 / $3.20", "intelligence": 8.8, "coding": 8.8, "agents": 8.2, "speed": 4.0, "cost": 7.5, "card_url": "https://huggingface.co/zai-org/GLM-5", "notes": "AA Index 50 (#1 open). HLE 50.4%. SWE-V 77.8%. MIT license. Huawei Ascend."},
    {"name": "GLM-5.1", "vendor": "Zhipu AI (Z.ai)", "color": "#00b4d8", "released": "Mar 27, 2026", "params": "744B / 40B active", "pricing": "$1.00 / $3.20", "intelligence": 8.8, "coding": 9.0, "agents": 8.3, "speed": 4.0, "cost": 7.5, "card_url": "https://huggingface.co/zai-org/GLM-5.1", "notes": "Coding 45.3 vs Opus 4.6's 47.9 (94.6%). 28% coding jump over GLM-5. Just released."},
    {"name": "GLM-4.7", "vendor": "Zhipu AI (Z.ai)", "color": "#00b4d8", "released": "2025", "params": "355B / 32B active", "pricing": "$0.40 / $1.28", "intelligence": 7.4, "coding": 7.9, "agents": 6.5, "speed": 5.5, "cost": 8.5, "card_url": "https://huggingface.co/zai-org/GLM-4.7", "notes": "AA Index ~42. HumanEval 94.2%. Strong predecessor. Open-weight."},
    {"name": "Kimi 2.5 Thinking", "vendor": "Moonshot AI", "color": "#e63946", "released": "Feb 2026", "params": "1T / 32B active", "pricing": "$0.60 / $3.00", "intelligence": 8.2, "coding": 8.7, "agents": 8.0, "speed": 5.0, "cost": 7.5, "card_url": "https://huggingface.co/moonshotai/Kimi-K2.5", "input_capabilities": ["text", "image", "video"], "notes": "AA Index 47. 1T params. HumanEval 99%. Agent Swarm native. Very verbose."},
    {"name": "Nemotron 3 Super", "vendor": "NVIDIA", "color": "#76b900", "released": "Mar 11, 2026", "params": "120B / 12B active", "pricing": "$0.12 / $0.12 (open-weight)", "intelligence": 6.8, "coding": 6.8, "agents": 7.0, "speed": 9.2, "cost": 9.0, "card_url": "https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16", "notes": "399 t/s (#3 fastest). Mamba-Attention hybrid. Multi-agent orchestrator. ~$0.12 blended. Free tier on some providers."},
    {"name": "Nemotron-Cascade 2", "vendor": "NVIDIA", "color": "#76b900", "released": "Mar 19, 2026", "params": "30B / 3B active", "pricing": "$0.05 / $0.10 (open-weight)", "intelligence": 5.8, "coding": 7.5, "agents": 5.0, "speed": 9.0, "cost": 9.5, "card_url": "https://huggingface.co/nvidia/Nemotron-Cascade-2-30B-A3B", "notes": "IMO/IOI/ICPC Gold medals. LCBv6 87.2%. Only 3B active. Math/code specialist. ~$0.05/$0.10 via providers."},
    {"name": "MiMo-V2-Pro", "vendor": "Xiaomi", "color": "#ff6900", "released": "Mar 18, 2026", "params": "1T+ / 42B active", "pricing": "$1.00 / $3.00", "intelligence": 8.6, "coding": 8.8, "agents": 8.5, "speed": 6.0, "cost": 7.5, "notes": "AA Index 49. SWE-V 78%. ClawEval 61.5. PinchBench 81. 1M ctx. Ex-Hunter Alpha."},
    {"name": "MiMo-V2-Omni", "vendor": "Xiaomi", "color": "#ff6900", "released": "Mar 18, 2026", "params": "Multimodal variant", "pricing": "$0.40 / $2.00", "intelligence": 7.7, "coding": 7.3, "agents": 7.0, "speed": 7.0, "cost": 8.5, "input_capabilities": ["text", "image", "audio", "video"], "notes": "Multimodal: image, video, audio. 262K ctx. Companion to V2-Pro."},
    {"name": "GPT-OSS 120B", "vendor": "OpenAI", "color": "#10a37f", "released": "Sep 2025", "params": "120B (open-weight)", "pricing": "$0.10 / $0.30 (open-weight)", "intelligence": 6.5, "coding": 7.3, "agents": 6.0, "speed": 9.0, "cost": 9.0, "card_url": "https://huggingface.co/openai/gpt-oss-120b", "input_capabilities": ["text"], "notes": "Open-weight from OpenAI. 120B / 5.1B active MoE. Apache 2.0. ~$0.10/$0.30 via providers. Up to 3000 t/s on Cerebras."},
    {"name": "GPT-5.1-Codex-Mini", "vendor": "OpenAI", "color": "#10a37f", "released": "Nov 2025", "params": "Proprietary", "pricing": "$1.25 / $10.00", "intelligence": 6.3, "coding": 7.0, "agents": 5.5, "speed": 7.0, "cost": 6.0, "card_url": "https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini", "input_capabilities": ["text", "image"], "notes": "Codex-optimized; works poorly outside OpenAI Codex harness. 400K ctx.", "status": "deprecated", "deprecated_on": "2026-04-22"},
    {"name": "Grok Code Fast 1", "vendor": "xAI", "color": "#1da1f2", "released": "Aug 2025", "params": "314B MoE", "pricing": "$0.20 / $1.50", "intelligence": 4.9, "coding": 6.2, "agents": 5.0, "speed": 9.3, "cost": 9.5, "card_url": "https://docs.x.ai/developers/models/grok-code-fast-1", "input_capabilities": ["text", "image"], "notes": "92 t/s. $0.20/$1.50. Speed-optimized coding model. 256K ctx.", "status": "deprecated", "deprecated_on": "2026-05-15"},
    {"name": "GPT-5 mini", "vendor": "OpenAI", "color": "#10a37f", "released": "Aug 2025", "params": "Proprietary", "pricing": "$0.25 / $2.00", "intelligence": 6.1, "coding": 6.5, "agents": 5.5, "speed": 7.0, "cost": 8.5, "card_url": "https://developers.openai.com/api/docs/models/gpt-5-mini", "input_capabilities": ["text", "image"], "notes": "Prior-gen. Superseded by GPT-5.4 mini. Being phased out.", "status": "superseded"},
    {"name": "GPT-4.1", "vendor": "OpenAI", "color": "#10a37f", "released": "Apr 2025", "params": "Proprietary", "pricing": "$3.00 / $12.00", "intelligence": 5.8, "coding": 6.2, "agents": 5.0, "speed": 7.0, "cost": 5.5, "card_url": "https://developers.openai.com/api/docs/models/gpt-4.1", "input_capabilities": ["text", "image"], "notes": "Legacy. 1M ctx. Tool-calling issues >300K tokens. Being superseded.", "status": "superseded"},
    {"name": "Gemma 4 31B Dense", "vendor": "Google", "color": "#4285f4", "released": "Apr 2, 2026", "params": "31B Dense", "pricing": "$0.08 / $0.16 (open-weight)", "intelligence": 7.5, "coding": 7.2, "agents": 7.0, "speed": 8.5, "cost": 9.5, "card_url": "https://ai.google.dev/gemma/docs/core/model_card_4", "input_capabilities": ["text", "image"], "notes": "GPQA 84.3%. #3 open on Arena AI. 31B dense. Apache 2.0. 256K ctx. Multimodal. ~$0.08/$0.16 via providers."},
    {"name": "Gemma 4 26B MoE", "vendor": "Google", "color": "#4285f4", "released": "Apr 2, 2026", "params": "26B / 3.8B active", "pricing": "$0.05 / $0.10 (open-weight)", "intelligence": 7.0, "coding": 6.8, "agents": 6.5, "speed": 9.3, "cost": 9.5, "card_url": "https://ai.google.dev/gemma/docs/core/model_card_4", "input_capabilities": ["text", "image"], "notes": "#6 open on Arena AI. 26B MoE, only 3.8B active. Ultra-fast. Apache 2.0. 256K ctx. ~$0.05/$0.10 via providers."},
    {"name": "Gemma 4 E4B", "vendor": "Google", "color": "#4285f4", "released": "Apr 2, 2026", "params": "E4B (4B effective)", "pricing": "$0.02 / $0.04 (open-weight)", "intelligence": 3.8, "coding": 3.5, "agents": 4.0, "speed": 9.8, "cost": 9.8, "card_url": "https://ai.google.dev/gemma/docs/core/model_card_4", "input_capabilities": ["text", "image", "audio"], "notes": "On-device edge model. 4B effective. 128K ctx. Multimodal (vision+audio+text). Runs on phones. Apache 2.0. ~$0.02/$0.04 via providers."},
]

assert len(MODELS) == 34, f"expected 34 seed models, got {len(MODELS)}"


def build_changelog_body(summary: str) -> str:
    new_lines = []
    for m in MODELS:
        tag = f" *({m['status']})*" if m.get("status") else ""
        new_lines.append(f"- **{m['name']}** — {m['vendor']} · {m['released']} · {m['pricing']}{tag}")
    new_block = "\n".join(new_lines)

    return f"""# Changelog — {SEED_TITLE}

## Seed Entry

This is the bootstrap changelog for LLM-Dash. No research was performed — the
dataset is a verbatim import of the 34-model snapshot captured in the
reference JSX ([references/llm-benchmark-dashboard.jsx](../references/llm-benchmark-dashboard.jsx))
on April 16, 2026.

{summary}

Scores are normalized to a 1–10 scale. Sources cited in the JSX header:
Artificial Analysis Intelligence Index v4.0, SWE-bench Verified/Pro,
Terminal-Bench 2.0, OSWorld-Verified, PinchBench, ClawEval, GPQA Diamond,
GDPval-AA, Vals AI, official model cards, vendor technical reports, and
OpenRouter pricing snapshots.

From tomorrow forward, every update follows [skill/SKILL.md](../skill/SKILL.md)
and every score change cites a URL inline.

## New Models (seed)

{new_block}

## Score Changes

None. This is the initial seed.

## Status Notes

Three models are marked as already-superseded per the JSX notes:
Claude Opus 4.6 (replaced by Opus 4.7), GPT-5 mini (replaced by GPT-5.4 mini),
and GPT-4.1 (legacy).
"""


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def word_count(body: str) -> int:
    return len(body.split())


def render_changelog_md(body: str, metrics: dict) -> str:
    frontmatter_names = [m["name"] for m in MODELS]
    frontmatter = {
        "date": SEED_DATE,
        "generated_at": metrics["completed_at"],
        "agent": "bootstrap",
        "agent_runtime": "init-script",
        "new_models": frontmatter_names,
        "changes": [],
    }
    fm_lines = ["---"]
    fm_lines.append(f"date: {frontmatter['date']}")
    fm_lines.append(f"generated_at: {frontmatter['generated_at']}")
    fm_lines.append(f"agent: {frontmatter['agent']}")
    fm_lines.append(f"agent_runtime: {frontmatter['agent_runtime']}")
    fm_lines.append(f"new_models: {json.dumps(frontmatter['new_models'])}")
    fm_lines.append("changes: []")
    fm_lines.append("---")
    fm = "\n".join(fm_lines)

    footer = f"""---

## Run Metadata

| metric | value |
|---|---|
| agent | bootstrap |
| agent_runtime | init-script |
| started_at | {metrics['started_at']} |
| completed_at | {metrics['completed_at']} |
| duration_sec | {metrics['duration_sec']} |
| input_tokens |  |
| output_tokens |  |
| cached_tokens |  |
| cost_usd |  |
| exa_searches | 0 |
| exa_fetches | 0 |
| word_count | {metrics['word_count']} |
"""
    return f"{fm}\n\n{body}\n{footer}"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CHANGELOGS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_schema(db_path: Path) -> None:
    """Create parent dir and apply schema.sql when the models table is absent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    try:
        row = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='models'"
        ).fetchone()
        if row:
            return
        con.execute("PRAGMA foreign_keys = ON;")
        con.executescript(SCHEMA_PATH.read_text())
        con.execute("PRAGMA foreign_keys = ON;")
    finally:
        con.close()


def seed(force: bool) -> None:
    ensure_dirs()

    if DB_PATH.exists():
        if not force:
            print(
                f"refusing to overwrite existing {_rel(DB_PATH)} "
                "(pass --force to reseed)",
                file=sys.stderr,
            )
            sys.exit(1)
        DB_PATH.unlink()

    # Bootstrap timestamps are synthetic — this isn't a real agent run, it's a
    # Day-1 seed. Anchoring to SEED_DATE keeps the changelog date, frontmatter,
    # and run_metrics row internally consistent regardless of when this script
    # actually executes.
    synthetic_ts = f"{SEED_DATE}T00:00:00Z"
    duration_sec = 0.0

    summary = (
        f"Bootstrap seed of {len(MODELS)} models across "
        f"{len({m['vendor'] for m in MODELS})} vendors. "
        "No research performed — import-only."
    )
    body = build_changelog_body(summary)
    wc = word_count(body)

    db_created = False
    con = sqlite3.connect(DB_PATH)
    db_created = True
    try:
        con.execute("PRAGMA foreign_keys = ON;")
        with SCHEMA_PATH.open() as f:
            con.executescript(f.read())
        # executescript issues its own COMMIT and some Python versions reset
        # connection pragmas across that boundary — re-assert.
        con.execute("PRAGMA foreign_keys = ON;")

        con.execute("BEGIN;")

        today = SEED_DATE
        for m in MODELS:
            con.execute(
                """INSERT INTO models (name, vendor, color, released, params,
                                       pricing, notes, card_url, input_capabilities,
                                       deprecated_on, first_seen, last_seen, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (m["name"], m["vendor"], m["color"], m["released"], m["params"],
                 m["pricing"], m["notes"], m.get("card_url") or VENDOR_CARD_URL.get(m["vendor"]),
                 canonical_capabilities(m.get("input_capabilities")), m.get("deprecated_on"),
                 today, today, m.get("status", "active")),
            )
            con.execute(
                """INSERT INTO model_scores (model_id, as_of, intelligence, coding,
                                             agents, speed, cost, source_notes)
                   SELECT id, ?, ?, ?, ?, ?, ?, ?
                   FROM models WHERE name = ?""",
                (today, m["intelligence"], m["coding"], m["agents"], m["speed"],
                 m["cost"], SOURCE_NOTE, m["name"]),
            )

        new_models_json = json.dumps([m["name"] for m in MODELS])
        changed_json = json.dumps([])
        con.execute(
            """INSERT INTO changelogs (date, title, path, summary,
                                       new_models_json, changed_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (SEED_DATE, SEED_TITLE, f"changelogs/{SEED_DATE}.md", summary,
             new_models_json, changed_json),
        )

        con.execute(
            """INSERT INTO run_metrics (changelog_date, started_at, completed_at,
                duration_sec, agent_name, agent_runtime, tokens_input, tokens_output,
                tokens_cached, cost_usd, exa_searches, exa_fetches, word_count, notes)
               VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?, ?)""",
            (SEED_DATE, synthetic_ts, synthetic_ts, duration_sec,
             "bootstrap", "init-script", wc,
             "Seed run — synthetic timestamps; 34-model bootstrap from reference JSX."),
        )

        con.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            ("last_updated", synthetic_ts),
        )
        con.execute("INSERT INTO meta (key, value) VALUES (?, ?)",
                    ("schema_version", SCHEMA_VERSION))
        con.execute("INSERT INTO meta (key, value) VALUES (?, ?)",
                    ("seed_version", SEED_VERSION))

        con.execute("COMMIT;")
    except Exception:
        try:
            con.execute("ROLLBACK;")
        except sqlite3.Error:
            pass
        con.close()
        if db_created and DB_PATH.exists():
            DB_PATH.unlink()
        raise
    else:
        con.close()

    md_path = CHANGELOGS_DIR / f"{SEED_DATE}.md"
    changelog_status = "existing"
    if not md_path.exists():
        md = render_changelog_md(body, {
            "started_at": synthetic_ts,
            "completed_at": synthetic_ts,
            "duration_sec": duration_sec,
            "word_count": wc,
        })
        md_path.write_text(md, encoding="utf-8")
        changelog_status = "created"

    export_metrics_csv()

    print(f"seeded {_rel(DB_PATH)}")
    print(f"  models:        {len(MODELS)}")
    print(f"  scores:        {len(MODELS)} @ {SEED_DATE}")
    print(f"  changelog:     {_rel(md_path)} ({changelog_status}, {wc} words)")
    print(f"  run_metrics:   1 row (synthetic bootstrap timestamps)")
    print(f"  metrics csv:   {_rel(CSV_PATH)}")


def export_metrics_csv() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.execute(
            """SELECT changelog_date, started_at, completed_at, duration_sec,
                      agent_name, agent_runtime, tokens_input, tokens_output,
                      tokens_cached, cost_usd, exa_searches, exa_fetches,
                      word_count, notes
               FROM run_metrics ORDER BY changelog_date"""
        )
        rows = cur.fetchall()
        headers = [d[0] for d in cur.description]
    finally:
        con.close()

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)


def main() -> None:
    p = argparse.ArgumentParser(description="Seed data/dash.sqlite for LLM-Dash.")
    p.add_argument("--force", action="store_true",
                   help="overwrite existing data/dash.sqlite")
    args = p.parse_args()
    seed(force=args.force)


if __name__ == "__main__":
    main()
