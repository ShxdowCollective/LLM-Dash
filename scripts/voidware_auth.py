#!/usr/bin/env python3
"""Server-side Voidware auth broker wrapper for LLM-Dash."""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

APP_NAME = "llm-dash"
PROVIDER_SECRET_NAME = "llmdash.provider.api_key"
EXA_SECRET_NAME = "llmdash.exa.api_key"
LLMSTATS_SECRET_NAME = "llmdash.llmstats.api_key"
# Request the longest broker grant lifetime Voidware currently accepts.
MAX_GRANT_TTL = "120d"
ROOT = Path(__file__).resolve().parents[1]

GRANT_RE = re.compile(r"vwgr_[A-Za-z0-9._-]+")


class VoidwareAuthError(RuntimeError):
    def __init__(self, message: str, *, code: str = "broker_error", details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


def _local_cli() -> Path:
    return Path.home() / "Repos" / "voidware" / "packages" / "cli" / "dist" / "bin.js"


def _context_flags() -> list[str]:
    root = os.environ.get("LLM_DASH_SHXDOW_ROOT")
    return ["--shxdowdir", str(Path(root).expanduser())] if root else []


def resolve_cli() -> list[str] | None:
    override = os.environ.get("VOIDWARE_CLI")
    if override:
        parts = shlex.split(override)
        if parts:
            return parts
    found = shutil.which("voidware")
    if found:
        return [found]
    local = _local_cli()
    if local.exists():
        return ["node", str(local)]
    return None


def _redact(value: str) -> str:
    return GRANT_RE.sub("vwgr_***", value)


def _parse_json(stdout: str, stderr: str) -> dict[str, Any]:
    for raw in (stdout, stderr):
        text = raw.strip()
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {"ok": False, "error": _redact((stderr or stdout).strip() or "voidware CLI returned no JSON")}


def _run(args: list[str], *, secret: str | None = None, timeout: int = 20) -> dict[str, Any]:
    cmd = resolve_cli()
    if not cmd:
        return {"ok": False, "error": "voidware CLI not found", "errorCode": "cli_unavailable"}
    try:
        result = subprocess.run(
            [*cmd, *args],
            cwd=ROOT,
            input=secret,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "error": "voidware CLI executable not found", "errorCode": "cli_unavailable"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "voidware broker request timed out", "errorCode": "broker_timeout"}
    payload = _parse_json(result.stdout, result.stderr)
    if result.returncode != 0 and payload.get("ok") is not False:
        payload = {"ok": False, "error": _redact(result.stderr.strip() or result.stdout.strip()), "errorCode": "cli_failed"}
    return payload


def broker_status() -> dict[str, Any]:
    cmd = resolve_cli()
    if not cmd:
        return {
            "available": False,
            "cli_available": False,
            "persistence": "",
            "error_code": "cli_unavailable",
            "grant_ttl": MAX_GRANT_TTL,
        }
    payload = _run(["auth", "broker", "status", *_context_flags(), "--json"], timeout=8)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "available": bool(payload.get("ok")),
        "cli_available": True,
        "persistence": str(data.get("persistence") or ""),
        "error_code": str(payload.get("errorCode") or ""),
        "grant_ttl": MAX_GRANT_TTL,
    }


def _request_args(
    operation: str,
    *,
    target: str | None = None,
    scope: str,
    allow_secret_output: bool = False,
    template: str | None = None,
    metadata: dict[str, Any] | None = None,
    custom: dict[str, Any] | None = None,
    secret_stdin: bool = False,
) -> list[str]:
    args = [
        "auth",
        "broker",
        "request",
        operation,
        *([target] if target else []),
        "--app",
        APP_NAME,
        "--scope",
        scope,
        "--ttl",
        MAX_GRANT_TTL,
        "--repo",
        str(ROOT),
        *_context_flags(),
        "--json",
    ]
    if allow_secret_output:
        args.append("--allow-secret-output")
    if template:
        args.extend(["--template", template])
    if metadata:
        args.extend(["--metadata", json.dumps(metadata, sort_keys=True)])
    if custom:
        args.extend(["--custom", json.dumps(custom, sort_keys=True)])
    if secret_stdin:
        args.append("--secret-stdin")
    return args


def _unwrap_or_raise(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("ok"):
        data = payload.get("data")
        return data if isinstance(data, dict) else {}
    raise VoidwareAuthError(
        _redact(str(payload.get("error") or "voidware broker request failed")),
        code=str(payload.get("errorCode") or "broker_error"),
        details=payload.get("details") if isinstance(payload.get("details"), dict) else {},
    )


def read_secret(name: str) -> str:
    data = _unwrap_or_raise(_run(_request_args(
        "auth:secret:read",
        target=name,
        scope=f"auth:secret:read:{name}",
        allow_secret_output=True,
    )))
    nested = data.get("data") if isinstance(data.get("data"), dict) else {}
    return str(nested.get("secret") or "")


def write_secret(name: str, secret: str, *, metadata: dict[str, Any] | None = None, custom: dict[str, Any] | None = None) -> None:
    _unwrap_or_raise(_run(_request_args(
        "auth:secret:write",
        target=name,
        scope=f"auth:secret:write:{name}",
        template="custom-http",
        metadata=metadata,
        custom=custom,
        secret_stdin=True,
    ), secret=secret))


def delete_secret(name: str) -> None:
    _unwrap_or_raise(_run(_request_args(
        "auth:secret:delete",
        target=name,
        scope=f"auth:secret:delete:{name}",
    )))
