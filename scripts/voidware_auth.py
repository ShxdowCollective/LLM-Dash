#!/usr/bin/env python3
"""Server-side Voidware auth broker wrapper for LLM-Dash."""

from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shlex
import shutil
import subprocess
import threading
import time
import atexit
from pathlib import Path
from typing import Any
from uuid import uuid4

APP_NAME = "llm-dash"
PROVIDER_SECRET_NAME = "llmdash.provider.api_key"
EXA_SECRET_NAME = "llmdash.exa.api_key"
LLMSTATS_SECRET_NAME = "llmdash.llmstats.api_key"
# Request the longest broker grant lifetime Voidware currently accepts.
MAX_GRANT_TTL = "120d"
DEFAULT_BROKER_TIMEOUT = 20
APPROVAL_BROKER_TIMEOUT = 120
ROOT = Path(__file__).resolve().parents[1]
LEGACY_CLIENT_GRANT_SERVICE_NAME = "llm-dash-voidware-grants"
OFFICIAL_CLIENT_GRANT_SERVICE_NAME = "voidware-client-grants"
CLIENT_GRANT_SERVICE_NAME = LEGACY_CLIENT_GRANT_SERVICE_NAME
BRIDGE_PATH = ROOT / "scripts" / "voidware_app_broker.mjs"

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


class _BridgeController:
    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.lock = threading.Lock()
        self.responses: dict[str, queue.Queue[dict[str, Any]]] = {}
        self.stderr: list[str] = []

    def _start_locked(self) -> None:
        if self.process and self.process.poll() is None:
            return
        if not BRIDGE_PATH.exists():
            raise VoidwareAuthError("Voidware app approval bridge is missing.", code="bridge_unavailable")
        self.responses.clear()
        self.stderr.clear()
        try:
            self.process = subprocess.Popen(
                ["node", str(BRIDGE_PATH)],
                cwd=ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise VoidwareAuthError("Node is required for Voidware app-owned approval.", code="node_unavailable") from exc
        threading.Thread(target=self._read_stdout, daemon=True).start()
        threading.Thread(target=self._read_stderr, daemon=True).start()

    def _read_stdout(self) -> None:
        proc = self.process
        if not proc or not proc.stdout:
            return
        for line in proc.stdout:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            response_id = str(payload.get("id") or "")
            q = self.responses.get(response_id)
            if q:
                q.put(payload)

    def _read_stderr(self) -> None:
        proc = self.process
        if not proc or not proc.stderr:
            return
        for line in proc.stderr:
            redacted = _redact(line.strip())
            if redacted:
                self.stderr.append(redacted[-500:])
                self.stderr[:] = self.stderr[-20:]

    def request(self, command: str, payload: dict[str, Any] | None = None, *, timeout: int = DEFAULT_BROKER_TIMEOUT) -> dict[str, Any]:
        request_id = uuid4().hex
        q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self.lock:
            self._start_locked()
            if not self.process or not self.process.stdin:
                raise VoidwareAuthError("Voidware app approval bridge failed to start.", code="bridge_unavailable")
            self.responses[request_id] = q
            try:
                self.process.stdin.write(json.dumps({"id": request_id, "command": command, "payload": payload or {}}) + "\n")
                self.process.stdin.flush()
            except BrokenPipeError as exc:
                self.responses.pop(request_id, None)
                self.stop()
                raise VoidwareAuthError("Voidware app approval bridge exited.", code="bridge_unavailable") from exc
        try:
            response = q.get(timeout=timeout)
        except queue.Empty as exc:
            raise VoidwareAuthError("Voidware app approval bridge timed out.", code="bridge_timeout") from exc
        finally:
            self.responses.pop(request_id, None)
        if response.get("ok") is False and response.get("code") not in {"approval_pending", "approval_waiting"}:
            raise VoidwareAuthError(
                _redact(str(response.get("message") or "Voidware app approval bridge failed.")),
                code=str(response.get("code") or "bridge_error"),
                details={"bridge": _bridge_error_details(response)},
            )
        return response

    def stop(self) -> None:
        proc = self.process
        self.process = None
        if not proc:
            return
        try:
            if proc.poll() is None and proc.stdin:
                proc.stdin.write(json.dumps({"id": uuid4().hex, "command": "stop", "payload": {}}) + "\n")
                proc.stdin.flush()
                proc.terminate()
                proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


_BRIDGE = _BridgeController()
atexit.register(_BRIDGE.stop)


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


def _bridge_error_details(response: dict[str, Any]) -> dict[str, Any]:
    details = response.get("details") if isinstance(response.get("details"), dict) else {}
    return {key: value for key, value in details.items() if key not in {"secret", "grantToken", "password"}}


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


def _run_once(cmd: list[str], args: list[str], *, secret: str | None = None, timeout: int = 20) -> dict[str, Any]:
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


def _status_payload() -> dict[str, Any]:
    payload = _run(["auth", "broker", "status", *_context_flags(), "--json"], timeout=8)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "ok": bool(payload.get("ok")),
        "error_code": str(payload.get("errorCode") or ""),
        "data": data,
    }


def _ensure_payload() -> dict[str, Any]:
    payload = _run(
        ["auth", "broker", "ensure", "--app", APP_NAME, *_context_flags(), "--json"],
        timeout=8,
    )
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    status = data.get("status") if isinstance(data.get("status"), dict) else {}
    actions = data.get("actions") if isinstance(data.get("actions"), list) else []
    return {
        "ok": bool(payload.get("ok")),
        "error_code": str(payload.get("errorCode") or ""),
        "running": bool(data.get("running")),
        "status": status,
        "actions": actions,
    }


def _approval_hint(status: dict[str, Any]) -> str:
    surface = str(status.get("approvalSurface") or status.get("approval_surface") or "")
    if surface == "electron":
        return "Approve the access request in the Voidware manager window."
    if surface == "tty":
        return "Approve the access request in the terminal where the Voidware auth broker is running."
    return (
        "Start an approval-capable Voidware auth broker (Voidware manager or "
        "`voidware auth broker start` in a terminal), then authorize access."
    )


def _run(args: list[str], *, secret: str | None = None, timeout: int = DEFAULT_BROKER_TIMEOUT) -> dict[str, Any]:
    cmd = resolve_cli()
    if not cmd:
        return {"ok": False, "error": "voidware CLI not found", "errorCode": "cli_unavailable"}
    return _run_once(cmd, args, secret=secret, timeout=timeout)


def broker_status() -> dict[str, Any]:
    try:
        response = _BRIDGE.request("status", timeout=8)
        status = response.get("status") if isinstance(response.get("status"), dict) else {}
        return {
            "available": bool(status),
            "cli_available": True,
            "bridge_available": True,
            "bridge_owned": bool(response.get("owned")),
            "service_module": str(response.get("serviceModule") or ""),
            "persistence": str(status.get("persistence") or ""),
            "approval_surface": str(status.get("approvalSurface") or ""),
            "can_approve": bool(status.get("canApprove")),
            "durable_grants": bool(status.get("durableGrants")),
            "durable_secrets": bool(status.get("durableSecrets")),
            "error_code": "",
            "grant_ttl": MAX_GRANT_TTL,
            "bootstrap_actions": [],
        }
    except VoidwareAuthError as bridge_exc:
        bridge_error = {
            "bridge_available": False,
            "bridge_error_code": bridge_exc.code,
            "bridge_error": str(bridge_exc),
        }
    cmd = resolve_cli()
    if not cmd:
        return {
            "available": False,
            "cli_available": False,
            **bridge_error,
            "persistence": "",
            "approval_surface": "",
            "can_approve": False,
            "error_code": "cli_unavailable",
            "grant_ttl": MAX_GRANT_TTL,
            "bootstrap_actions": [],
        }
    status = _status_payload()
    data = status["data"]
    ensure = _ensure_payload() if not status["ok"] else {"running": True, "status": data, "actions": []}
    broker_data = ensure["status"] if ensure.get("running") and ensure.get("status") else data
    return {
        "available": bool(status["ok"] or ensure.get("running")),
        "cli_available": True,
        **bridge_error,
        "persistence": str(broker_data.get("persistence") or ""),
        "approval_surface": str(broker_data.get("approvalSurface") or ""),
        "can_approve": bool(broker_data.get("canApprove")),
        "durable_grants": bool(broker_data.get("durableGrants")),
        "durable_secrets": bool(broker_data.get("durableSecrets")),
        "error_code": status["error_code"] or str(ensure.get("error_code") or ""),
        "grant_ttl": MAX_GRANT_TTL,
        "bootstrap_actions": ensure.get("actions") or [],
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
    code = str(payload.get("errorCode") or "broker_error")
    message = _redact(str(payload.get("error") or "voidware broker request failed"))
    details: dict[str, Any] = {}
    if code == "approval_required":
        status = broker_status()
        message = (
            "Voidware needs your approval before LLM-Dash can use this saved key. "
            + _approval_hint({"approvalSurface": status.get("approval_surface")})
        )
        details["broker"] = status
    raise VoidwareAuthError(message, code=code, details=details)


def _require_approval_capable_broker() -> dict[str, Any]:
    status = broker_status()
    if not status.get("available"):
        actions = status.get("bootstrap_actions") or []
        hint = "Voidware auth broker is not running."
        if actions:
            hint += " Start it with Voidware manager or `voidware auth broker start` in a terminal."
        raise VoidwareAuthError(hint, code="broker_unavailable", details={"broker": status})
    if not status.get("can_approve"):
        raise VoidwareAuthError(
            "The running Voidware auth broker cannot show approval prompts. "
            + _approval_hint({"approvalSurface": status.get("approval_surface")}),
            code="approval_required",
            details={"broker": status},
        )
    return status


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
    require_fresh_grant: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    account = _grant_cache_account(operation, target, scope)
    cached = {} if require_fresh_grant else _load_cached_grant(account)
    if cached:
        payload = _run(
            _request_args(
                operation,
                target=target,
                scope=scope,
                grant_token=str(cached.get("grantToken")),
                allow_secret_output=allow_secret_output,
            ),
            timeout=DEFAULT_BROKER_TIMEOUT,
        )
        if payload.get("ok"):
            return payload, cached
        if payload.get("errorCode") in FRESH_GRANT_CODES:
            _keyring_delete(CLIENT_GRANT_SERVICE_NAME, account)
        else:
            return payload, cached

    _require_approval_capable_broker()
    payload = _run(
        _request_args(
            operation,
            target=target,
            scope=scope,
            allow_secret_output=allow_secret_output,
        ),
        timeout=APPROVAL_BROKER_TIMEOUT,
    )
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    if payload.get("ok") and isinstance(data, dict):
        _store_cached_grant(account, data, operation=operation, target=target, scope=scope)
    return payload, {}


def _normalize_bridge_grant(response: dict[str, Any]) -> dict[str, Any]:
    grant = response.get("grant") if isinstance(response.get("grant"), dict) else {}
    result: dict[str, Any] = {"grant": grant}
    if response.get("operationId"):
        result["operation_id"] = str(response.get("operationId"))
    return result


def _bridge_read_grant(name: str, *, force_refresh: bool = False, timeout: int = APPROVAL_BROKER_TIMEOUT) -> dict[str, Any]:
    response = _BRIDGE.request(
        "readSecretGrant",
        {"name": name, "forceRefresh": force_refresh},
        timeout=timeout,
    )
    if response.get("ok"):
        result = _normalize_bridge_grant(response)
        result["secret"] = str(response.get("secret") or "")
        _clear_legacy_grant_cache()
        return result
    code = str(response.get("code") or "broker_error")
    if code in {"approval_pending", "approval_waiting"}:
        return {
            "pending": True,
            "code": code,
            "operation_id": str(response.get("operationId") or ""),
            "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
        }
    raise VoidwareAuthError(_redact(str(response.get("message") or "Voidware approval failed.")), code=code)


def request_credential_access_grant(name: str) -> dict[str, Any]:
    """Request (or renew) broker access for a saved Voidware credential."""
    return _bridge_read_grant(name, force_refresh=True)


def read_secret_with_grant(name: str, *, require_fresh_grant: bool = False) -> dict[str, Any]:
    try:
        bridge_result = _bridge_read_grant(name, force_refresh=require_fresh_grant, timeout=5 if not require_fresh_grant else APPROVAL_BROKER_TIMEOUT)
        if bridge_result.get("pending"):
            raise VoidwareAuthError(
                "Voidware needs your approval in LLM-Dash before this saved key can be used.",
                code=str(bridge_result.get("code") or "approval_pending"),
                details={"approval": bridge_result.get("approval"), "operation_id": bridge_result.get("operation_id")},
            )
        grant = bridge_result.get("grant") if isinstance(bridge_result.get("grant"), dict) else {}
        return {"secret": str(bridge_result.get("secret") or ""), "grant": grant}
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    scope = f"auth:secret:read:{name}"
    payload, cached_grant = _run_cached_request(
        "auth:secret:read",
        target=name,
        scope=scope,
        allow_secret_output=True,
        require_fresh_grant=require_fresh_grant,
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
    try:
        response = _BRIDGE.request("discoverProviders", {"reusableOnly": reusable_only}, timeout=12)
        data = response.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
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
    try:
        response = _BRIDGE.request(
            "writeSecret",
            {"name": name, "secret": secret, "metadata": metadata or {}, "custom": custom or {}},
            timeout=APPROVAL_BROKER_TIMEOUT,
        )
        if response.get("ok") is False:
            raise VoidwareAuthError(
                _redact(str(response.get("message") or "Voidware secret write failed.")),
                code=str(response.get("code") or "bridge_error"),
                details={
                    "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
                    "operation_id": str(response.get("operationId") or ""),
                },
            )
        return
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
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
    try:
        response = _BRIDGE.request("deleteSecret", {"name": name}, timeout=APPROVAL_BROKER_TIMEOUT)
        if response.get("ok") is False:
            raise VoidwareAuthError(
                _redact(str(response.get("message") or "Voidware secret delete failed.")),
                code=str(response.get("code") or "bridge_error"),
                details={
                    "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
                    "operation_id": str(response.get("operationId") or ""),
                },
            )
        return
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    _unwrap_or_raise(_run(_request_args(
        "auth:secret:delete",
        target=name,
        scope=f"auth:secret:delete:{name}",
    )))


def pending_approval() -> dict[str, Any]:
    response = _BRIDGE.request("pendingApproval", timeout=5)
    return {"pending": response.get("pending") if isinstance(response.get("pending"), dict) else None}


def approve_pending_approval(*, password: str = "", secret: str = "") -> dict[str, Any]:
    response = _BRIDGE.request("approve", {"password": password, "secret": secret}, timeout=APPROVAL_BROKER_TIMEOUT)
    if response.get("ok"):
        _clear_legacy_grant_cache()
        return _normalize_bridge_grant(response)
    raise VoidwareAuthError(_redact(str(response.get("message") or "Voidware approval failed.")), code=str(response.get("code") or "approval_denied"))


def deny_pending_approval() -> None:
    response = _BRIDGE.request("deny", timeout=8)
    if response.get("code") == "approval_denied":
        raise VoidwareAuthError("Voidware approval was denied.", code="approval_denied")
    if response.get("ok") is False:
        raise VoidwareAuthError(str(response.get("message") or "Voidware approval denial failed."), code=str(response.get("code") or "approval_not_found"))


def shutdown_bridge() -> None:
    _BRIDGE.stop()


def _clear_legacy_grant_cache() -> None:
    # Legacy entries are account-hashed; avoid probing secret material. Best effort only.
    return None
