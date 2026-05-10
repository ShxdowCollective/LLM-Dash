#!/usr/bin/env python3
"""Server-side Voidware auth broker wrapper for LLM-Dash."""

from __future__ import annotations

import hashlib
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
CLIENT_GRANT_SERVICE_NAME = "llm-dash-voidware-grants"

GRANT_RE = re.compile(r"vwgr_[A-Za-z0-9._-]+")
FRESH_GRANT_CODES = {
    "grant_denied",
    "grant_expired",
    "grant_invalidated",
    "durable_secret_unavailable",
    "renewal_needed",
}


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
        "approval_surface": str(data.get("approvalSurface") or ""),
        "durable_grants": bool(data.get("durableGrants")),
        "durable_secrets": bool(data.get("durableSecrets")),
        "error_code": str(payload.get("errorCode") or ""),
        "grant_ttl": MAX_GRANT_TTL,
    }


def _request_args(
    operation: str,
    *,
    target: str | None = None,
    scope: str,
    grant_token: str | None = None,
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
    if grant_token:
        args.extend(["--grant", grant_token])
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


def _unwrap_or_raise(payload: dict[str, Any]) -> Any:
    if payload.get("ok"):
        return payload.get("data")
    raise VoidwareAuthError(
        _redact(str(payload.get("error") or "voidware broker request failed")),
        code=str(payload.get("errorCode") or "broker_error"),
        details=payload.get("details") if isinstance(payload.get("details"), dict) else {},
    )


def _grant_metadata(data: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "expiresAt",
        "ttlMs",
        "recommendedTtlMs",
        "maxTtlMs",
        "renewAfter",
        "renewalWindowStartsAt",
        "renewalRecommended",
    )
    grant = data.get("grant") if isinstance(data.get("grant"), dict) else {}
    meta: dict[str, Any] = {}
    for key in keys:
        value = grant.get(key, data.get(key))
        if value is not None:
            meta[key] = value
    return meta


def _keyring_get(service: str, account: str) -> str:
    try:
        import keyring
    except Exception:
        return ""
    try:
        return keyring.get_password(service, account) or ""
    except Exception:
        return ""


def _keyring_set(service: str, account: str, value: str) -> None:
    try:
        import keyring
    except Exception:
        return
    try:
        keyring.set_password(service, account, value)
    except Exception:
        return


def _keyring_delete(service: str, account: str) -> None:
    try:
        import keyring
    except Exception:
        return
    try:
        keyring.delete_password(service, account)
    except Exception:
        return


def _fingerprint_file(path: Path) -> str:
    try:
        stat = path.stat()
        digest = hashlib.sha256()
        digest.update(f"{stat.st_size}:{stat.st_mtime}:".encode("utf-8"))
        digest.update(path.read_bytes())
        return digest.hexdigest()
    except FileNotFoundError:
        return "missing"
    except Exception:
        return "unavailable"


def _auth_fingerprint() -> str:
    shxdow_dir = Path(os.environ.get("LLM_DASH_SHXDOW_ROOT") or (Path.home() / ".shxdow")).expanduser()
    payload = {
        "authFile": str(shxdow_dir / "auth.json"),
        "fileState": _fingerprint_file(shxdow_dir / "auth.json"),
        "keyringIndexFile": str(shxdow_dir / ".keyring-index.json"),
        "keyringIndexState": _fingerprint_file(shxdow_dir / ".keyring-index.json"),
        "repoPath": str(ROOT),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _grant_cache_account(operation: str, target: str | None, scope: str) -> str:
    payload = json.dumps([
        APP_NAME,
        str(ROOT),
        operation,
        target or "",
        [scope],
        _auth_fingerprint(),
    ], separators=(",", ":"))
    return "client-grant:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _load_cached_grant(account: str) -> dict[str, Any]:
    raw = _keyring_get(CLIENT_GRANT_SERVICE_NAME, account)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        return {}
    if not isinstance(data, dict):
        _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        return {}
    token = data.get("grantToken")
    expires_at = data.get("expiresAt")
    if not isinstance(token, str) or not token.startswith("vwgr_") or not isinstance(expires_at, str):
        _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        return {}
    try:
        from datetime import datetime, timezone
        expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
            return {}
    except Exception:
        _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        return {}
    return data


def _store_cached_grant(account: str, data: dict[str, Any], *, operation: str, target: str, scope: str) -> None:
    token = data.get("grantToken")
    grant = _grant_metadata(data)
    expires_at = grant.get("expiresAt")
    if not isinstance(token, str) or not token.startswith("vwgr_") or not isinstance(expires_at, str):
        return
    stored = {
        "v": 1,
        "app": APP_NAME,
        "repoPath": str(ROOT),
        "operation": operation,
        "target": target,
        "scopes": [scope],
        "authFileFingerprint": _auth_fingerprint(),
        "grantToken": token,
        **grant,
    }
    _keyring_set(CLIENT_GRANT_SERVICE_NAME, account, json.dumps(stored, sort_keys=True))


def _run_cached_request(
    operation: str,
    target: str,
    *,
    scope: str,
    allow_secret_output: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    account = _grant_cache_account(operation, target, scope)
    cached = _load_cached_grant(account)
    if cached:
        payload = _run(_request_args(
            operation,
            target=target,
            scope=scope,
            grant_token=str(cached.get("grantToken")),
            allow_secret_output=allow_secret_output,
        ))
        if payload.get("ok"):
            return payload, cached
        if payload.get("errorCode") in FRESH_GRANT_CODES:
            _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        else:
            return payload, cached

    payload = _run(_request_args(
        operation,
        target=target,
        scope=scope,
        allow_secret_output=allow_secret_output,
    ))
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    if payload.get("ok") and isinstance(data, dict):
        _store_cached_grant(account, data, operation=operation, target=target, scope=scope)
    return payload, {}


def read_secret_with_grant(name: str) -> dict[str, Any]:
    scope = f"auth:secret:read:{name}"
    payload, cached_grant = _run_cached_request(
        "auth:secret:read",
        target=name,
        scope=scope,
        allow_secret_output=True,
    )
    data = _unwrap_or_raise(payload)
    data = data if isinstance(data, dict) else {}
    nested = data.get("data") if isinstance(data.get("data"), dict) else {}
    grant = _grant_metadata(data)
    if not grant and cached_grant:
        grant = _grant_metadata(cached_grant)
    return {"secret": str(nested.get("secret") or ""), "grant": grant}


def read_secret(name: str) -> str:
    return str(read_secret_with_grant(name).get("secret") or "")


def discover_provider_credentials(*, reusable_only: bool = True) -> list[dict[str, Any]]:
    args = [
        "auth",
        "providers",
        "list",
    ]
    if reusable_only:
        args.extend(["--reusability", "reusable", "--has-secret", "true"])
    args.extend([*_context_flags(), "--json"])
    payload = _run(args, timeout=12)
    data = _unwrap_or_raise(payload)
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    data = data if isinstance(data, dict) else {}
    if isinstance(data.get("data"), list):
        return [item for item in data["data"] if isinstance(item, dict)]
    return []


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
