#!/usr/bin/env python3
"""Server-side Voidware auth broker wrapper for LLM-Dash."""

from __future__ import annotations

import hashlib
import json
import os
import sys
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
AA_SECRET_NAME = "llmdash.aa.api_key"
# Request the longest broker grant lifetime Voidware currently accepts.
MAX_GRANT_TTL = "120d"
DEFAULT_BROKER_TIMEOUT = 20
APPROVAL_BROKER_TIMEOUT = 300
ROOT = Path(__file__).resolve().parents[1]
LEGACY_CLIENT_GRANT_SERVICE_NAME = "llm-dash-voidware-grants"
OFFICIAL_CLIENT_GRANT_SERVICE_NAME = "voidware-client-grants"
CLIENT_GRANT_SERVICE_NAME = OFFICIAL_CLIENT_GRANT_SERVICE_NAME
LLMDASH_MANAGED_APPS = frozenset({APP_NAME, "llmdash", "llm-dash"})
FILE_AUTH_SOURCES = frozenset({"user-file", "repo-file", "override-file", "portable"})
REF_SECRET_KEYS = frozenset({"secret", "encryptedSecret", "grantToken", "password"})
SENSITIVE_META_KEY_PARTS = ("authorization", "api-key", "apikey", "token", "secret", "key", "password")
BRIDGE_PATH = ROOT / "scripts" / "voidware_app_broker.mjs"
INSTALL_OVER_MARKER_FILE = ".shxdowgen-install-over-marker"

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
_APPROVED_SECRET_CACHE: dict[str, dict[str, Any]] = {}
_LEGACY_GRANT_ACCOUNTS: set[str] = set()
atexit.register(_BRIDGE.stop)


def _local_cli() -> Path:
    return Path.home() / "Repos" / "voidware" / "packages" / "cli" / "dist" / "bin.js"


def _context_flags() -> list[str]:
    root = os.environ.get("LLM_DASH_SHXDOW_ROOT")
    return ["--shxdowdir", str(Path(root).expanduser())] if root else []


def _shxdow_dir() -> Path:
    return Path(os.environ.get("LLM_DASH_SHXDOW_ROOT") or (Path.home() / ".shxdow")).expanduser()


def _auth_file_path() -> Path:
    return _shxdow_dir() / "auth.json"


def _read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _is_legacy_install_over_auth_marker(path: Path | None = None) -> bool:
    data = _read_json_file(path or _auth_file_path())
    if not data:
        return False
    return (
        set(data) == {"marker", "version", "credentials"}
        and data.get("version") == 3
        and isinstance(data.get("marker"), str)
        and bool(str(data.get("marker")).strip())
        and data.get("credentials") == {}
    )


def _legacy_marker_empty_result() -> dict[str, Any]:
    return {
        "secret": "",
        "grant": {},
        "recovered": "legacy-install-over-marker",
        "markerFile": str(_shxdow_dir() / INSTALL_OVER_MARKER_FILE),
    }


def _move_legacy_install_over_auth_marker() -> bool:
    auth_file = _auth_file_path()
    if not _is_legacy_install_over_auth_marker(auth_file):
        return False
    marker_file = auth_file.with_name(INSTALL_OVER_MARKER_FILE)
    try:
        marker_file.write_text(auth_file.read_text(encoding="utf-8"), encoding="utf-8")
        auth_file.unlink()
        return True
    except OSError as exc:
        raise VoidwareAuthError(
            "Could not move old install-over verification marker out of auth.json.",
            code="legacy_marker_move_failed",
        ) from exc


def resolve_cli() -> list[str] | None:
    override = os.environ.get("VOIDWARE_CLI")
    if override:
        parts = shlex.split(override)
        if parts:
            return parts
    node_modules = ROOT / "node_modules" / "@shxdowcollective" / "voidware-cli" / "dist" / "bin.js"
    if node_modules.exists():
        return ["node", str(node_modules)]
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
    if _is_legacy_install_over_auth_marker():
        return {
            "available": False,
            "cli_available": False,
            "bridge_available": False,
            "bridge_error_code": "legacy_install_over_marker",
            "bridge_error": "Old install-over verification marker detected in auth.json; treating it as empty credentials.",
            "persistence": "",
            "approval_surface": "",
            "can_approve": False,
            "durable_grants": False,
            "durable_secrets": False,
            "error_code": "legacy_install_over_marker",
            "grant_ttl": MAX_GRANT_TTL,
            "bootstrap_actions": [],
        }
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


def stop_background_broker() -> dict[str, Any]:
    status = broker_status()
    if status.get("bridge_owned") and status.get("available"):
        raise VoidwareAuthError("LLM-Dash owns the active Voidware broker.", code="broker_owned")
    payload = _run(["auth", "broker", "stop", *_context_flags(), "--json"], timeout=10)
    if not payload.get("ok"):
        code = str(payload.get("errorCode") or "broker_stop_failed")
        message = _redact(str(payload.get("error") or "Voidware broker stop failed."))
        raise VoidwareAuthError(message, code=code)
    return {"ok": True, "status": broker_status()}


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
    ref: dict[str, Any] | None = None,
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
    if ref:
        args.extend(["--ref", json.dumps(ref, sort_keys=True)])
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
    shxdow_dir = _shxdow_dir()
    payload = {
        "authFile": str(shxdow_dir / "auth.json"),
        "fileState": _fingerprint_file(shxdow_dir / "auth.json"),
        "keyringIndexFile": str(shxdow_dir / ".keyring-index.json"),
        "keyringIndexState": _fingerprint_file(shxdow_dir / ".keyring-index.json"),
        "repoPath": str(ROOT),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _ref_identity_key(ref: dict[str, Any] | None) -> str:
    if not ref:
        return ""
    parts = [str(ref.get("name") or ""), str(ref.get("source") or "")]
    if ref.get("authFilePath"):
        parts.append(str(ref["authFilePath"]))
    if ref.get("envVar"):
        parts.append(str(ref["envVar"]))
    return "|".join(parts)


def _parse_credential_ref(raw: Any) -> dict[str, Any] | None:
    if raw in (None, "", {}):
        return None
    parsed: Any = raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return None
    if not isinstance(parsed, dict):
        return None
    name = str(parsed.get("name") or "").strip()
    source = str(parsed.get("source") or "").strip()
    if not name or not source:
        return None
    ref: dict[str, Any] = {
        "refVersion": parsed.get("refVersion", 1),
        "name": name,
        "source": source,
        "keyringBacked": bool(parsed.get("keyringBacked", parsed.get("keyring_backed", False))),
        "hasSecret": bool(parsed.get("hasSecret", parsed.get("has_secret", True))),
    }
    for key in ("authFilePath", "envVar", "label", "locked", "unreadable", "lockedReason", "backupPath"):
        if parsed.get(key) is not None:
            ref[key] = parsed[key]
    meta = parsed.get("meta")
    if isinstance(meta, dict):
        ref["meta"] = _safe_ref_meta(meta)
    return ref


def _safe_ref_meta(meta: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for key, value in meta.items():
        if key in REF_SECRET_KEYS:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            cleaned[key] = value
        elif isinstance(value, dict):
            nested = _safe_ref_meta(value)
            if nested:
                cleaned[key] = nested
    custom = cleaned.get("custom")
    if isinstance(custom, dict):
        cleaned["custom"] = {
            str(k): v
            for k, v in custom.items()
            if isinstance(k, str)
            and isinstance(v, (str, int, float, bool))
            and k.lower() not in REF_SECRET_KEYS
            and not any(part in str(k).lower() for part in SENSITIVE_META_KEY_PARTS)
        }
    return cleaned


def safe_credential_ref(raw: Any) -> dict[str, Any]:
    ref = _parse_credential_ref(raw)
    if not ref:
        return {}
    safe = dict(ref)
    if "meta" in safe:
        safe["meta"] = _safe_ref_meta(safe["meta"])
    return safe


def serialize_credential_ref(ref: dict[str, Any] | None) -> str:
    parsed = _parse_credential_ref(ref)
    if not parsed:
        return ""
    return json.dumps(parsed, sort_keys=True, separators=(",", ":"))


def source_label(source: str) -> str:
    normalized = str(source or "").strip()
    if normalized == "keyring":
        return "keyring"
    if normalized == "env":
        return "env"
    if normalized in FILE_AUTH_SOURCES:
        return "auth.json"
    return normalized or "unknown"


def is_llmdash_managed_custom(custom: dict[str, Any] | None) -> bool:
    if not isinstance(custom, dict):
        return False
    app = str(custom.get("app") or "").strip().lower()
    kind = str(custom.get("kind") or "").strip().lower()
    if app not in LLMDASH_MANAGED_APPS:
        return False
    return bool(kind)


def credential_managed_by_llmdash(*, ref: dict[str, Any] | None = None, custom: dict[str, Any] | None = None, name: str = "") -> bool:
    _ = name
    if custom and is_llmdash_managed_custom(custom):
        return True
    if ref:
        meta = ref.get("meta")
        if isinstance(meta, dict):
            meta_custom = meta.get("custom")
            if isinstance(meta_custom, dict) and is_llmdash_managed_custom(meta_custom):
                return True
    return False


def grant_renewal_status(grant: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(grant, dict) or not grant:
        return {"status": "none", "renewal_recommended": False, "expires_at": ""}
    expires_at = str(grant.get("expiresAt") or "")
    renewal_recommended = bool(grant.get("renewalRecommended"))
    status = "active"
    if renewal_recommended:
        status = "renewal_needed"
    if expires_at:
        try:
            from datetime import datetime, timezone
            expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires <= datetime.now(timezone.utc):
                status = "expired"
        except Exception:
            pass
    return {
        "status": status,
        "renewal_recommended": renewal_recommended,
        "expires_at": expires_at,
        "renew_after": str(grant.get("renewAfter") or ""),
    }


def _grant_cache_account(
    operation: str,
    target: str | None,
    scope: str,
    *,
    ref: dict[str, Any] | None = None,
) -> str:
    payload = json.dumps([
        APP_NAME,
        str(ROOT),
        operation,
        target or "",
        _ref_identity_key(ref),
        [scope],
        _auth_fingerprint(),
    ], separators=(",", ":"))
    return "client-grant:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _load_cached_grant_from_service(service: str, account: str, *, delete_on_invalid: bool) -> dict[str, Any]:
    raw = _keyring_get(service, account)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        if delete_on_invalid:
            _keyring_delete(service, account)
        return {}
    if not isinstance(data, dict):
        if delete_on_invalid:
            _keyring_delete(service, account)
        return {}
    token = data.get("grantToken")
    expires_at = data.get("expiresAt")
    if not isinstance(token, str) or not token.startswith("vwgr_") or not isinstance(expires_at, str):
        if delete_on_invalid:
            _keyring_delete(service, account)
        return {}
    try:
        from datetime import datetime, timezone
        expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            if delete_on_invalid:
                _keyring_delete(service, account)
            return {}
    except Exception:
        if delete_on_invalid:
            _keyring_delete(service, account)
        return {}
    return data


def _load_cached_grant(account: str) -> dict[str, Any]:
    official = _load_cached_grant_from_service(OFFICIAL_CLIENT_GRANT_SERVICE_NAME, account, delete_on_invalid=True)
    if official:
        return official
    return _load_cached_grant_from_service(LEGACY_CLIENT_GRANT_SERVICE_NAME, account, delete_on_invalid=False)


def _delete_cached_grant(account: str) -> None:
    _keyring_delete(OFFICIAL_CLIENT_GRANT_SERVICE_NAME, account)
    _keyring_delete(LEGACY_CLIENT_GRANT_SERVICE_NAME, account)


def _invalidate_secret_mutation_caches(name: str, *, credential_ref: dict[str, Any] | None = None) -> None:
    ref = _parse_credential_ref(credential_ref)
    _APPROVED_SECRET_CACHE.pop(name, None)
    ref_key = _ref_identity_key(ref)
    if ref_key:
        _APPROVED_SECRET_CACHE.pop(ref_key, None)
    read_scope = f"auth:secret:read:{name}"
    if ref:
        # Ref reads cache the durable grant under both the ref op kind
        # (auth:ref:read) and the secret op kind; purge both so a mutation
        # never leaves a stale ref-scoped read grant.
        _delete_cached_grant(_grant_cache_account("auth:ref:read", name, read_scope, ref=ref))
        _delete_cached_grant(_grant_cache_account("auth:secret:read", name, read_scope, ref=ref))
    _delete_cached_grant(_grant_cache_account("auth:secret:read", name, read_scope))


def _store_cached_grant(
    account: str,
    data: dict[str, Any],
    *,
    operation: str,
    target: str,
    scope: str,
    ref: dict[str, Any] | None = None,
) -> None:
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
        "refIdentity": _ref_identity_key(ref),
        "authFileFingerprint": _auth_fingerprint(),
        "grantToken": token,
        **grant,
    }
    _keyring_set(OFFICIAL_CLIENT_GRANT_SERVICE_NAME, account, json.dumps(stored, sort_keys=True))


def _run_cached_request(
    operation: str,
    target: str,
    *,
    scope: str,
    allow_secret_output: bool = False,
    require_fresh_grant: bool = False,
    ref: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    account = _grant_cache_account(operation, target, scope, ref=ref)
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
            _delete_cached_grant(account)
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
        _store_cached_grant(account, data, operation=operation, target=target, scope=scope, ref=ref)
    return payload, {}


def _normalize_bridge_grant(response: dict[str, Any]) -> dict[str, Any]:
    grant = response.get("grant") if isinstance(response.get("grant"), dict) else {}
    result: dict[str, Any] = {"grant": grant}
    if response.get("operationId"):
        result["operation_id"] = str(response.get("operationId"))
    return result


def _bridge_read_grant(
    name: str,
    *,
    force_refresh: bool = False,
    timeout: int = APPROVAL_BROKER_TIMEOUT,
    credential_ref: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if credential_ref:
        response = _BRIDGE.request(
            "readRefGrant",
            {"ref": credential_ref, "forceRefresh": force_refresh},
            timeout=timeout,
        )
    else:
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


def request_credential_access_grant(name: str, *, credential_ref: dict[str, Any] | None = None) -> dict[str, Any]:
    """Request (or renew) broker access for a saved Voidware credential."""
    ref = _parse_credential_ref(credential_ref)
    return _bridge_read_grant(name or str(ref.get("name") if ref else ""), force_refresh=True, credential_ref=ref)


def read_secret_with_grant(
    name: str = "",
    *,
    credential_ref: dict[str, Any] | str | None = None,
    require_fresh_grant: bool = False,
) -> dict[str, Any]:
    ref = _parse_credential_ref(credential_ref)
    resolved_name = str(ref.get("name") if ref else name or "").strip()
    if not resolved_name:
        return {"secret": "", "grant": {}}
    if _is_legacy_install_over_auth_marker():
        return _legacy_marker_empty_result()
    cache_key = _ref_identity_key(ref) or resolved_name
    cached_approval = _APPROVED_SECRET_CACHE.get(cache_key)
    if cached_approval and not require_fresh_grant:
        return {
            "secret": str(cached_approval.get("secret") or ""),
            "grant": cached_approval.get("grant") if isinstance(cached_approval.get("grant"), dict) else {},
        }
    try:
        bridge_result = _bridge_read_grant(
            resolved_name,
            force_refresh=require_fresh_grant,
            timeout=5 if not require_fresh_grant else APPROVAL_BROKER_TIMEOUT,
            credential_ref=ref,
        )
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
    operation = "auth:ref:read" if ref else "auth:secret:read"
    scope = f"auth:secret:read:{resolved_name}"
    cli_operation = "auth:secret:read"
    payload, cached_grant = _run_cached_request(
        cli_operation,
        target=resolved_name,
        scope=scope,
        allow_secret_output=True,
        require_fresh_grant=require_fresh_grant,
        ref=ref,
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


def _safe_auth_ref_row(ref: dict[str, Any]) -> dict[str, Any]:
    safe = safe_credential_ref(ref)
    if not safe:
        return {}
    source = str(safe.get("source") or "")
    meta = safe.get("meta") if isinstance(safe.get("meta"), dict) else {}
    custom = meta.get("custom") if isinstance(meta.get("custom"), dict) else {}
    return {
        "name": str(safe.get("name") or ""),
        "label": str(safe.get("label") or safe.get("name") or ""),
        "source": source,
        "source_label": source_label(source),
        "ref": safe,
        "has_secret": bool(safe.get("hasSecret", True)),
        "read_only": source == "env",
        "managed_by_llmdash": credential_managed_by_llmdash(ref=safe, custom=custom, name=str(safe.get("name") or "")),
        "locked": bool(safe.get("locked")),
        "unreadable": bool(safe.get("unreadable")),
    }


def discover_auth_refs() -> tuple[list[dict[str, Any]], bool]:
    if _is_legacy_install_over_auth_marker():
        return [], False
    refs_available = False
    try:
        response = _BRIDGE.request("discoverAuthRefs", timeout=12)
        data = response.get("data")
        if isinstance(data, list):
            refs_available = bool(response.get("refsAvailable", True))
            return [_safe_auth_ref_row(item) for item in data if isinstance(item, dict) and _safe_auth_ref_row(item)], refs_available
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    payload = _run(["auth", "refs", "list", *_context_flags(), "--json"], timeout=12)
    if not payload.get("ok"):
        return [], False
    data = payload.get("data")
    rows: list[dict[str, Any]] = []
    if isinstance(data, list):
        refs_available = True
        for item in data:
            if isinstance(item, dict):
                row = _safe_auth_ref_row(item)
                if row:
                    rows.append(row)
    elif isinstance(data, dict) and isinstance(data.get("data"), list):
        refs_available = True
        for item in data["data"]:
            if isinstance(item, dict):
                row = _safe_auth_ref_row(item)
                if row:
                    rows.append(row)
    return rows, refs_available


def _same_name_ambiguity_warnings(rows: list[dict[str, Any]]) -> list[str]:
    by_name: dict[str, set[str]] = {}
    for row in rows:
        name = str(row.get("name") or "")
        if not name:
            continue
        by_name.setdefault(name, set()).add(str(row.get("source_label") or row.get("source") or ""))
    warnings: list[str] = []
    for name, sources in sorted(by_name.items()):
        if len(sources) > 1:
            warnings.append(
                f'Credential "{name}" exists in multiple sources ({", ".join(sorted(sources))}); select an exact source ref.'
            )
    return warnings


def _safe_provider_by_ref_row(row: dict[str, Any]) -> dict[str, Any]:
    """Shape a `discoverProviderCredentialsByRef` row into an LLM-Dash candidate.

    Each upstream row already embeds the exact-source `ref` plus provider meta
    (baseURL/modelsURL), so the LLM-Dash-side fields (`source_label`,
    `managed_by_llmdash`, `locked`, `unreadable`) are derived from that ref —
    no hand-rolled name join needed.
    """
    ref = safe_credential_ref(row.get("ref"))
    if not ref:
        return {}
    name = str(row.get("name") or ref.get("name") or "")
    if not name:
        return {}
    source = str(row.get("source") or ref.get("source") or "")
    meta = ref.get("meta") if isinstance(ref.get("meta"), dict) else {}
    custom = meta.get("custom") if isinstance(meta.get("custom"), dict) else {}
    shaped: dict[str, Any] = {
        "name": name,
        "label": str(row.get("label") or ref.get("label") or name),
        "source": source,
        "sources": [source] if source else [],
        "source_label": source_label(source),
        "ref": ref,
        "hasSecret": bool(row.get("hasSecret", ref.get("hasSecret", True))),
        "keyringBacked": bool(row.get("keyringBacked", ref.get("keyringBacked", False))),
        "reusability": str(row.get("reusability") or ""),
        "managed_by_llmdash": credential_managed_by_llmdash(ref=ref, custom=custom, name=name),
        "locked": bool(ref.get("locked")),
        "unreadable": bool(ref.get("unreadable")),
    }
    for key in ("providerFamily", "protocol", "baseURL", "modelsURL", "chatURL", "apiFormat"):
        if row.get(key):
            shaped[key] = row[key]
    safe_custom = row.get("safeCustom")
    if isinstance(safe_custom, dict):
        shaped["safeCustom"] = _safe_ref_meta(safe_custom)
    return shaped


def discover_provider_credentials_by_ref(*, reusable_only: bool = True) -> tuple[list[dict[str, Any]], bool]:
    """Ref-qualified provider discovery: one row per exact provider credential source.

    Returns `(rows, available)`. `available` is False when the ref-qualified
    path cannot run (bridge unavailable or an older Voidware runtime without
    `discoverProvidersBySource`), so callers fall back to the name join.
    """
    if _is_legacy_install_over_auth_marker():
        return [], False
    try:
        response = _BRIDGE.request("discoverProvidersByRef", {"reusableOnly": reusable_only}, timeout=12)
        data = response.get("data")
        if isinstance(data, list):
            if not bool(response.get("refsAvailable", True)):
                return [], False
            rows = [_safe_provider_by_ref_row(item) for item in data if isinstance(item, dict)]
            return [row for row in rows if row], True
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    return [], False


def _join_provider_rows_with_refs(
    provider_rows: list[dict[str, Any]],
    ref_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Legacy name-join fallback for installs without ref-qualified discovery."""
    refs_by_name: dict[str, list[dict[str, Any]]] = {}
    for row in ref_rows:
        if not row.get("has_secret"):
            continue
        name = str(row.get("name") or "")
        if not name:
            continue
        refs_by_name.setdefault(name, []).append(row)

    provider_candidates: list[dict[str, Any]] = []
    for provider_row in provider_rows:
        name = str(provider_row.get("name") or "")
        matching_refs = refs_by_name.get(name, [])
        if matching_refs:
            for ref_row in matching_refs:
                merged = dict(provider_row)
                merged["ref"] = ref_row["ref"]
                merged["source"] = ref_row["source"]
                merged["source_label"] = ref_row["source_label"]
                merged["managed_by_llmdash"] = ref_row["managed_by_llmdash"]
                merged["locked"] = ref_row["locked"]
                merged["unreadable"] = ref_row["unreadable"]
                if not provider_row.get("label"):
                    merged["label"] = ref_row["label"]
                provider_candidates.append(merged)
        else:
            provider_candidates.append(provider_row)
    return provider_candidates


def discover_credential_candidates() -> dict[str, Any]:
    ref_rows, refs_available = discover_auth_refs()
    warnings = _same_name_ambiguity_warnings(ref_rows)
    if not refs_available:
        warnings.append("Exact-source credential refs are unavailable; name-only selection may be ambiguous.")

    by_ref_rows, by_ref_available = discover_provider_credentials_by_ref(reusable_only=True)
    if by_ref_available:
        provider_candidates = by_ref_rows
        provider_names = {str(row.get("name") or "") for row in by_ref_rows if row.get("name")}
    else:
        provider_rows = discover_provider_credentials(reusable_only=True)
        provider_names = {str(item.get("name") or "") for item in provider_rows if item.get("name")}
        provider_candidates = _join_provider_rows_with_refs(provider_rows, ref_rows)

    generic_rows = [
        row for row in ref_rows
        if row.get("has_secret") and str(row.get("name") or "") not in provider_names
    ]

    return {
        "refs_available": refs_available,
        "same_name_warnings": warnings,
        "provider_candidates": provider_candidates,
        "generic_candidates": generic_rows,
        "auth_refs": ref_rows,
    }


def discover_provider_credentials(*, reusable_only: bool = True) -> list[dict[str, Any]]:
    if _is_legacy_install_over_auth_marker():
        return []
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


def write_secret(
    name: str,
    secret: str,
    *,
    metadata: dict[str, Any] | None = None,
    custom: dict[str, Any] | None = None,
    require_fresh_grant: bool = False,
    credential_ref: dict[str, Any] | str | None = None,
) -> None:
    _move_legacy_install_over_auth_marker()
    ref = _parse_credential_ref(credential_ref)
    if require_fresh_grant:
        _invalidate_secret_mutation_caches(name, credential_ref=ref)
    try:
        if ref:
            response = _BRIDGE.request(
                "writeRefSecret",
                {
                    "ref": ref,
                    "secret": secret,
                    "metadata": metadata or {},
                    "custom": custom or {},
                    "forceRefresh": bool(require_fresh_grant),
                },
                timeout=APPROVAL_BROKER_TIMEOUT,
            )
        else:
            response = _BRIDGE.request(
                "writeSecret",
                {
                    "name": name,
                    "secret": secret,
                    "metadata": metadata or {},
                    "custom": custom or {},
                    "forceRefresh": bool(require_fresh_grant),
                },
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
        _invalidate_secret_mutation_caches(name, credential_ref=ref)
        return
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    if ref:
        _unwrap_or_raise(_run(_request_args(
            "auth:ref:write",
            target=str(ref.get("name") or name),
            scope=f"auth:secret:write:{name}",
            template="custom-http",
            metadata=metadata,
            custom=custom,
            secret_stdin=True,
            ref=ref,
        ), secret=secret))
    else:
        _unwrap_or_raise(_run(_request_args(
            "auth:secret:write",
            target=name,
            scope=f"auth:secret:write:{name}",
            template="custom-http",
            metadata=metadata,
            custom=custom,
            secret_stdin=True,
        ), secret=secret))
    _invalidate_secret_mutation_caches(name, credential_ref=ref)


def delete_secret(
    name: str,
    *,
    require_fresh_grant: bool = False,
    credential_ref: dict[str, Any] | str | None = None,
) -> None:
    ref = _parse_credential_ref(credential_ref)
    if require_fresh_grant:
        _invalidate_secret_mutation_caches(name, credential_ref=ref)
    try:
        if ref:
            response = _BRIDGE.request(
                "deleteRefSecret",
                {"ref": ref, "forceRefresh": bool(require_fresh_grant)},
                timeout=APPROVAL_BROKER_TIMEOUT,
            )
        else:
            response = _BRIDGE.request(
                "deleteSecret",
                {"name": name, "forceRefresh": bool(require_fresh_grant)},
                timeout=APPROVAL_BROKER_TIMEOUT,
            )
        if response.get("ok") is False:
            raise VoidwareAuthError(
                _redact(str(response.get("message") or "Voidware secret delete failed.")),
                code=str(response.get("code") or "bridge_error"),
                details={
                    "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
                    "operation_id": str(response.get("operationId") or ""),
                },
            )
        _invalidate_secret_mutation_caches(name, credential_ref=ref)
        return
    except VoidwareAuthError as exc:
        if exc.code not in {"bridge_unavailable", "node_unavailable", "node_unsupported"}:
            raise
    if ref:
        _unwrap_or_raise(_run(_request_args(
            "auth:ref:delete",
            target=str(ref.get("name") or name),
            scope=f"auth:secret:delete:{name}",
            ref=ref,
        )))
    else:
        _unwrap_or_raise(_run(_request_args(
            "auth:secret:delete",
            target=name,
            scope=f"auth:secret:delete:{name}",
        )))
    _invalidate_secret_mutation_caches(name, credential_ref=ref)


def pending_approval() -> dict[str, Any]:
    response = _BRIDGE.request("pendingApproval", timeout=5)
    return {"pending": response.get("pending") if isinstance(response.get("pending"), dict) else None}


def approve_pending_approval(*, password: str = "", secret: str = "") -> dict[str, Any]:
    response = _BRIDGE.request("approve", {"password": password, "secret": secret}, timeout=APPROVAL_BROKER_TIMEOUT)
    if response.get("ok"):
        _clear_legacy_grant_cache()
        target = str(response.get("target") or "")
        approved_secret = str(response.get("secret") or "")
        cache_key = str(response.get("cacheKey") or target)
        if cache_key and approved_secret:
            _APPROVED_SECRET_CACHE[cache_key] = {
                "secret": approved_secret,
                "grant": response.get("grant") if isinstance(response.get("grant"), dict) else {},
            }
        return _normalize_bridge_grant(response)
    code = str(response.get("code") or "")
    if code in {"approval_pending", "approval_waiting"}:
        return {
            "pending": True,
            "code": code,
            "operation_id": str(response.get("operationId") or ""),
            "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
        }
    raise VoidwareAuthError(
        _redact(str(response.get("message") or "Voidware approval failed.")),
        code=str(response.get("code") or "approval_denied"),
        details={
            "approval": response.get("approval") if isinstance(response.get("approval"), dict) else {},
            "operation_id": str(response.get("operationId") or ""),
        },
    )


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


def _grant_list_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        grants = data.get("grants")
        if isinstance(grants, list):
            return [item for item in grants if isinstance(item, dict)]
    return []


def _grant_matches_llmdash(grant: dict[str, Any]) -> bool:
    app = str(grant.get("app") or grant.get("appName") or "").strip()
    repo = str(grant.get("repoPath") or grant.get("repo") or "").strip()
    repo_root = str(ROOT)
    if app and app not in {APP_NAME, "llm-dash"}:
        return False
    if repo and repo != repo_root:
        return False
    return app in {APP_NAME, "llm-dash"} or repo == repo_root


DEFAULT_LLMDASH_SECRET_NAMES = (
    "llmdash.provider.api_key",
    "llmdash.exa.api_key",
    "llmdash.llmstats.api_key",
)


def _grant_cache_accounts_for_names(names: tuple[str, ...] | list[str]) -> set[str]:
    # Accounts are deterministic hashes of (app, repo, op, target, scope,
    # auth fingerprint), so cached read-grant entries for known secret names can
    # be reconstructed without enumerating the keyring. Entries written under an
    # older auth fingerprint cannot be derived and expire on their own TTL.
    accounts: set[str] = set()
    for name in names:
        clean = str(name or "").strip()
        if not clean:
            continue
        accounts.add(_grant_cache_account("auth:secret:read", clean, f"auth:secret:read:{clean}"))
    return accounts


def _client_grant_index_path() -> Path:
    # Mirrors voidware's userClientGrantIndexPath(): <shxdow_dir>/data/client-grant-index.json.
    return _shxdow_dir() / "data" / "client-grant-index.json"


def _index_entry_matches_llmdash(entry: dict[str, Any]) -> bool:
    app = str(entry.get("app") or "").strip()
    repo = str(entry.get("repoPath") or "").strip()
    if app and app not in {APP_NAME, "llm-dash"}:
        return False
    if repo and repo != str(ROOT):
        return False
    return app in {APP_NAME, "llm-dash"} or repo == str(ROOT)


def _client_grant_index_accounts() -> set[str]:
    # Enumerate every LLM-Dash grant-cache account voidware recorded in the
    # durable client-grant index, regardless of the auth fingerprint it was
    # written under. This is what lets the purge reach entries that the
    # fingerprint-derived path cannot reconstruct.
    data = _read_json_file(_client_grant_index_path())
    if not isinstance(data, dict) or data.get("v") != 1:
        return set()
    entries = data.get("entries")
    if not isinstance(entries, list):
        return set()
    accounts: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or not _index_entry_matches_llmdash(entry):
            continue
        account = str(entry.get("account") or "").strip()
        if account:
            accounts.add(account)
    return accounts


def _rewrite_client_grant_index_without(accounts: set[str]) -> None:
    path = _client_grant_index_path()
    data = _read_json_file(path)
    if not isinstance(data, dict):
        return
    entries = data.get("entries")
    if not isinstance(entries, list):
        return
    kept = [
        entry
        for entry in entries
        if not (isinstance(entry, dict) and str(entry.get("account") or "").strip() in accounts)
    ]
    if len(kept) == len(entries):
        return
    try:
        path.write_text(json.dumps({"v": 1, "entries": kept}, indent=2), encoding="utf-8")
    except OSError:
        return


def _delete_legacy_grant_cache_entries(secret_names: tuple[str, ...] | list[str] = ()) -> list[str]:
    removed: list[str] = []
    purged_accounts: set[str] = set()
    for account in sorted(_LEGACY_GRANT_ACCOUNTS):
        _keyring_delete(LEGACY_CLIENT_GRANT_SERVICE_NAME, account)
        _LEGACY_GRANT_ACCOUNTS.discard(account)
        purged_accounts.add(account)
        removed.append(f"legacy-grant-cache:{account}")
    for account in sorted(_grant_cache_accounts_for_names([*DEFAULT_LLMDASH_SECRET_NAMES, *secret_names])):
        for service in (LEGACY_CLIENT_GRANT_SERVICE_NAME, OFFICIAL_CLIENT_GRANT_SERVICE_NAME):
            if _keyring_get(service, account):
                _keyring_delete(service, account)
                removed.append(f"grant-cache:{service}:{account}")
        purged_accounts.add(account)
    # Index-driven purge: covers ref-scoped accounts and entries written under
    # stale auth fingerprints that the derived path above cannot reconstruct.
    index_accounts = _client_grant_index_accounts()
    new_index_accounts = sorted(index_accounts - purged_accounts)
    for account in new_index_accounts:
        for service in (LEGACY_CLIENT_GRANT_SERVICE_NAME, OFFICIAL_CLIENT_GRANT_SERVICE_NAME):
            _keyring_delete(service, account)
        removed.append(f"grant-cache-index:{account}")
    if index_accounts:
        _rewrite_client_grant_index_without(index_accounts)
    return removed


def clear_llmdash_grants(*, dry_run: bool = False, secret_names: tuple[str, ...] | list[str] = ()) -> dict[str, Any]:
    """Clear LLM-Dash broker grants and in-process auth caches.

    Voidware credentials, auth files, and the shared grant store are preserved.
    Grant cleanup warnings never fail the caller's data reset.
    """
    warnings: list[str] = []
    revoked: list[str] = []
    removed_cache: list[str] = []

    if dry_run:
        list_payload = _run(["auth", "grants", "list", *_context_flags(), "--json"], timeout=15)
        if not list_payload.get("ok"):
            error_code = str(list_payload.get("errorCode") or "")
            message = _redact(str(list_payload.get("error") or "grant list failed"))
            if error_code == "broker_unavailable":
                print(f"[voidware_auth] grant cleanup skipped (broker unavailable): {message}", file=sys.stderr)
            else:
                warnings.append(f"grant cleanup preview skipped: {message}")
        else:
            for grant in _grant_list_items(list_payload):
                if not _grant_matches_llmdash(grant):
                    continue
                grant_id = str(grant.get("id") or grant.get("grantId") or "").strip()
                if grant_id:
                    revoked.append(grant_id)
            if revoked:
                warnings.append(f"grant cleanup preview: would revoke {len(revoked)} LLM-Dash grant(s)")
            elif not warnings:
                warnings.append("grant cleanup preview: no matching LLM-Dash grants found")
        return {"revoked": revoked, "removed_cache": removed_cache, "warnings": warnings}

    _APPROVED_SECRET_CACHE.clear()
    _BRIDGE.stop()

    list_payload = _run(["auth", "grants", "list", *_context_flags(), "--json"], timeout=15)
    if not list_payload.get("ok"):
        error_code = str(list_payload.get("errorCode") or "")
        message = _redact(str(list_payload.get("error") or "grant list failed"))
        if error_code == "broker_unavailable":
            print(f"[voidware_auth] grant cleanup skipped (broker unavailable): {message}", file=sys.stderr)
        else:
            warnings.append(f"grant cleanup skipped: {message}")
    else:
        for grant in _grant_list_items(list_payload):
            if not _grant_matches_llmdash(grant):
                continue
            grant_id = str(grant.get("id") or grant.get("grantId") or "").strip()
            if not grant_id:
                continue
            revoke_payload = _run(["auth", "grants", "revoke", grant_id, *_context_flags(), "--json"], timeout=15)
            if revoke_payload.get("ok"):
                revoked.append(grant_id)
            else:
                warnings.append(
                    _redact(
                        f"grant revoke failed for {grant_id}: "
                        f"{revoke_payload.get('error') or revoke_payload.get('errorCode') or 'unknown error'}"
                    )
                )

    cleanup_payload = _run(["auth", "grants", "cleanup", *_context_flags(), "--json"], timeout=15)
    if not cleanup_payload.get("ok"):
        error_code = str(cleanup_payload.get("errorCode") or "")
        if error_code != "broker_unavailable":
            warnings.append(
                _redact(
                    f"grant cleanup pass failed: "
                    f"{cleanup_payload.get('error') or cleanup_payload.get('errorCode') or 'unknown error'}"
                )
            )

    removed_cache = _delete_legacy_grant_cache_entries(secret_names)
    return {"revoked": revoked, "removed_cache": removed_cache, "warnings": warnings}
