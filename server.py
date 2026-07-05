#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import platform
import re
import shlex
import sqlite3
import subprocess
import sys
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scripts import voidware_auth
from scripts.config import (
    AA_BASE_URL,
    LLMSTATS_BASE_URL,
    CREDENTIAL_SLOTS,
    ConfigError,
    ProviderBundle,
    ProviderConfig,
    ProviderSecrets,
    build_auth_headers,
    clear_credential_slot_selection,
    delete_slot_credential,
    discover_all_credential_slots,
    load_aa_api_key,
    load_llmstats_api_key,
    load_provider_config,
    load_provider_bundle,
    discover_provider_credentials,
    normalize_base_url,
    normalize_endpoint_mode,
    public_provider_state,
    remove_aa_api_key,
    remove_exa_api_key,
    remove_llmstats_api_key,
    remove_provider_api_key,
    save_aa_api_key,
    save_exa_api_key,
    save_provider,
    save_slot_api_key,
    save_llmstats_api_key,
    select_credential_slot,
    update_slot_api_key,
)
from scripts.migrate_score_checks import migrate as migrate_score_checks
from scripts.migrate_model_metadata_v4 import migrate as migrate_metadata_v4
from scripts.schedule_job import ScheduleError, apply_schedule, remove_schedule, status as schedule_status

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
ASSETS_DIR = ROOT / "assets"
# Data and changelog roots are env-overridable so an isolated harness (e2e tests)
# can run against a throwaway dir without touching the real, append-only state.
DATA_DIR = Path(os.environ.get("LLM_DASH_DATA_DIR") or (ROOT / "data")).resolve()
CHANGELOGS_DIR = Path(
    os.environ.get("LLM_DASH_CHANGELOGS_DIR") or (ROOT / "changelogs")
).resolve()
DB_PATH = DATA_DIR / "dash.sqlite"
INIT_DB_PATH = ROOT / "scripts" / "init_db.py"
RUN_UPDATE_PATH = ROOT / "scripts" / "run_update.py"
SEED_CATALOG_PATH = ROOT / "scripts" / "seed_catalog.py"
LOGS_DIR = ROOT / "logs"
PROVIDER_PRESETS_PATH = WEB_DIR / "provider-presets.json"

DATA_DIR.mkdir(exist_ok=True)
CHANGELOGS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="LLM-Dash")


@app.on_event("shutdown")
def shutdown_voidware_bridge() -> None:
    voidware_auth.shutdown_bridge()

_bootstrap_lock = threading.Lock()
_bootstrap_thread: threading.Thread | None = None
_bootstrap_state = {
    "state": "ready" if DB_PATH.exists() else "pending",
    "message": "Dashboard database ready." if DB_PATH.exists() else "Waiting to seed dashboard database.",
    "detail": "",
}
_jobs_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


class ProviderPayload(BaseModel):
    base_url: str
    api_key: str | None = None
    provider_credential_name: str | None = None
    provider_credential_meta: dict[str, Any] | None = None
    models_override_url: str = ""
    default_model: str = ""
    backup_model: str = ""
    endpoint_mode: str = "append_v1"
    request_headers: dict[str, str] | None = None


class TestModelPayload(BaseModel):
    target: str = "default"
    model: str = ""


class ExaPayload(BaseModel):
    api_key: str


class LLMStatsPayload(BaseModel):
    api_key: str


class AAPayload(BaseModel):
    api_key: str


class SeedPayload(BaseModel):
    preset: str
    count: int = 25
    index: str = ""
    prompt: str = ""
    endpoint: str = ""
    credential: str = ""


class RunUpdatePayload(BaseModel):
    preset: str = "exa"
    count: int = 25
    index: str = ""
    prompt: str = ""
    endpoint: str = ""
    credential: str = ""


class VoidwareGrantPayload(BaseModel):
    credential_name: str = ""
    credential_ref: dict[str, Any] | None = None


class CredentialSlotSelectPayload(BaseModel):
    credential_name: str = ""
    credential_ref: dict[str, Any] | None = None
    credential_meta: dict[str, Any] | None = None


class CredentialSlotSecretPayload(BaseModel):
    api_key: str
    external_mutation: bool = False
    require_fresh_grant: bool = False


class VoidwareApprovalPayload(BaseModel):
    password: str = ""
    secret: str = ""


class SchedulePayload(BaseModel):
    cadence: str = "off"
    time_local: str = "09:00"
    day_of_week: int = 1
    day_of_month: int = 1


class ResetPayload(BaseModel):
    scope: str
    confirm_token: str = ""


def _set_bootstrap_state(state: str, message: str, detail: str = "") -> None:
    with _bootstrap_lock:
        _bootstrap_state["state"] = state
        _bootstrap_state["message"] = message
        _bootstrap_state["detail"] = detail


def _tail_output(stdout: str, stderr: str) -> str:
    lines = [line.strip() for line in (stdout + "\n" + stderr).splitlines() if line.strip()]
    return " | ".join(lines[-4:])


def _safe_tail(path: Path, max_chars: int = 4000) -> str:
    try:
        data = path.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return ""
    return _redact_known_secrets(data[-max_chars:])


def _job_tail(log_path: Path, job: dict[str, Any]) -> str:
    # Seed and refresh both now emit a rich, parsed marker stream (tool calls,
    # phases). Give refresh the same generous tail so the in-app console can show
    # the full timeline, not just the last few lines.
    return _safe_tail(log_path, max_chars=64000)


def _redact_known_secrets(text: str) -> str:
    redacted = voidware_auth.GRANT_RE.sub("vwgr_***", text)
    redacted = re.sub(r"\bsk-[A-Za-z0-9._-]{8,}\b", "sk-***", redacted)
    redacted = re.sub(r"\bxai-[A-Za-z0-9._-]{8,}\b", "xai-***", redacted)
    redacted = re.sub(r"\bAIza[A-Za-z0-9._-]{8,}\b", "AIza***", redacted)
    return redacted


def _http_error(exc: Exception, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=str(exc))


def _voidware_auth_http_error(exc: voidware_auth.VoidwareAuthError) -> HTTPException:
    detail: dict[str, Any] = {
        "message": _redact_known_secrets(str(exc)),
        "code": exc.code,
        "broker": voidware_auth.broker_status(),
    }
    if exc.details:
        detail.update(exc.details)
    return HTTPException(status_code=403, detail=detail)


def _provider_presets() -> dict[str, Any]:
    try:
        with PROVIDER_PRESETS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Provider preset catalog is missing.") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Provider preset catalog is invalid JSON: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("providers"), list):
        raise HTTPException(status_code=500, detail="Provider preset catalog has an invalid shape.")
    return data


def _provider_headers() -> dict[str, str]:
    bundle = load_provider_bundle()
    if not bundle.secrets.api_key:
        raise ConfigError("Agent Provider API key is not configured.")
    headers = build_auth_headers(bundle)
    headers.setdefault("Accept", "application/json")
    return headers


def _normalize_models(payload: Any) -> list[dict[str, str]]:
    if isinstance(payload, dict):
        raw_models = payload.get("data", payload.get("models", []))
    elif isinstance(payload, list):
        raw_models = payload
    else:
        raw_models = []
    models: list[dict[str, str]] = []
    for item in raw_models:
        model_id = ""
        if isinstance(item, dict):
            model_id = str(item.get("id") or item.get("name") or "")
        else:
            model_id = str(item or "")
        if model_id:
            models.append({"id": model_id, "name": model_id})
    return models


def _bundle_from_payload(payload: ProviderPayload) -> ProviderBundle:
    mode = normalize_endpoint_mode(payload.endpoint_mode)
    stored = load_provider_bundle()
    api_key = (payload.api_key or "").strip()
    if not api_key and payload.provider_credential_name:
        api_key = str(voidware_auth.read_secret_with_grant(payload.provider_credential_name).get("secret") or "")
    return ProviderBundle(
        config=ProviderConfig(
            base_url=normalize_base_url(payload.base_url, allow_v1=mode == "root"),
            models_override_url=normalize_base_url(
                payload.models_override_url,
                field="models_override_url",
                allow_v1=mode == "root",
            )
            if payload.models_override_url
            else "",
            default_model=payload.default_model.strip(),
            backup_model=payload.backup_model.strip(),
            endpoint_mode=mode,
            request_headers=payload.request_headers,
        ),
        secrets=ProviderSecrets(api_key=api_key or stored.secrets.api_key),
    )


async def _fetch_models_for_bundle(bundle: ProviderBundle) -> tuple[int, Any]:
    import httpx

    if not bundle.config.base_url:
        raise ConfigError("Agent Provider base_url is not configured.")
    if not bundle.secrets.api_key:
        raise ConfigError("Agent Provider API key is not configured.")
    headers = build_auth_headers(bundle)
    headers.setdefault("Accept", "application/json")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(bundle.models_endpoint, headers=headers)
    try:
        payload: Any = response.json()
    except ValueError:
        payload = {"text": response.text[:500]}
    return response.status_code, payload


async def _fetch_provider_models() -> tuple[int, Any]:
    return await _fetch_models_for_bundle(load_provider_bundle())


def _job_log_path(job_id: str) -> Path:
    return LOGS_DIR / f"run-update-{job_id}.log"


def _watch_job(job_id: str, process: subprocess.Popen[str], log_path: Path) -> None:
    exit_code = process.wait()
    completed_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["completed_at"] = completed_at
        job["exit_code"] = exit_code
        job["state"] = "canceled" if job.get("cancel_requested") else "succeeded" if exit_code == 0 else "failed"
        job.pop("process", None)
        job["tail"] = _job_tail(log_path, job)


def _any_update_job_running() -> bool:
    with _jobs_lock:
        return any(job.get("state") == "running" for job in _jobs.values())


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key not in {"process"}}


def _last_updated() -> str | None:
    if not DB_PATH.exists():
        return None
    con: sqlite3.Connection | None = None
    try:
        con = sqlite3.connect(DB_PATH)
        row = con.execute("SELECT value FROM meta WHERE key = 'last_updated'").fetchone()
    except sqlite3.Error:
        return None
    finally:
        try:
            if con is not None:
                con.close()
        except Exception:
            pass
    return row[0] if row else None


def _database_ready() -> bool:
    return _last_updated() is not None


def _run_bootstrap() -> None:
    try:
        result = subprocess.run(
            [sys.executable, str(INIT_DB_PATH)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception as exc:  # pragma: no cover - defensive
        _set_bootstrap_state("error", "Failed to launch the bootstrap seed.", str(exc))
        return

    if result.returncode != 0:
        _set_bootstrap_state(
            "error",
            "Bootstrap seed failed before the dashboard was ready.",
            _tail_output(result.stdout, result.stderr) or "Check the server logs for the full traceback.",
        )
        return

    if not _database_ready():
        _set_bootstrap_state(
            "error",
            "Bootstrap finished, but dash.sqlite was not queryable.",
            _tail_output(result.stdout, result.stderr),
        )
        return

    _set_bootstrap_state("ready", "Dashboard database ready.", "")


def ensure_bootstrap_started() -> None:
    global _bootstrap_thread

    if _bootstrap_state["state"] == "initializing" and _bootstrap_thread and _bootstrap_thread.is_alive():
        return

    if _database_ready() and _bootstrap_state["state"] != "initializing":
        _set_bootstrap_state("ready", "Dashboard database ready.", "")
        return

    with _bootstrap_lock:
        if _bootstrap_thread and _bootstrap_thread.is_alive():
            return
        if _database_ready():
            _bootstrap_state["state"] = "ready"
            _bootstrap_state["message"] = "Dashboard database ready."
            _bootstrap_state["detail"] = ""
            return
        if _bootstrap_state["state"] == "error":
            return
        _bootstrap_state["state"] = "needs_setup"
        _bootstrap_state["message"] = "No catalog yet — run setup to seed the dashboard."
        _bootstrap_state["detail"] = ""


def _launch_windows_terminal(cwd: Path) -> str | None:
    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    for label, command in (
        ("Windows Terminal", ["wt.exe", "-d", str(cwd)]),
        ("cmd", ["cmd.exe", "/K", f'cd /d "{cwd}"']),
    ):
        try:
            subprocess.Popen(command, creationflags=creationflags)
            return label
        except FileNotFoundError:
            continue
    return None


def _launch_macos_terminal(cwd: Path) -> str | None:
    command = f"cd {shlex.quote(str(cwd))}"
    try:
        subprocess.Popen(
            [
                "osascript",
                "-e",
                f'tell application "Terminal" to do script {json.dumps(command)}',
                "-e",
                'tell application "Terminal" to activate',
            ]
        )
        return "Terminal.app"
    except FileNotFoundError:
        return None


def _launch_linux_terminal(cwd: Path) -> str | None:
    launchers = (
        ("gnome-terminal", ["gnome-terminal", f"--working-directory={cwd}"]),
        ("konsole", ["konsole", "--workdir", str(cwd)]),
        ("xfce4-terminal", ["xfce4-terminal", f"--working-directory={cwd}"]),
        ("xterm", ["xterm", "-e", "bash", "-lc", f"cd {shlex.quote(str(cwd))}; exec bash"]),
    )
    for label, command in launchers:
        try:
            subprocess.Popen(command)
            return label
        except FileNotFoundError:
            continue
    return None


def _open_terminal(cwd: Path) -> str | None:
    system = platform.system()
    if system == "Windows":
        return _launch_windows_terminal(cwd)
    if system == "Darwin":
        return _launch_macos_terminal(cwd)
    return _launch_linux_terminal(cwd)


@app.on_event("startup")
def _startup() -> None:
    ensure_bootstrap_started()
    if DB_PATH.exists():
        try:
            migrate_score_checks(DB_PATH)
            migrate_metadata_v4(DB_PATH)
        except Exception as exc:
            import logging
            logging.getLogger("llm-dash").warning("startup migration skipped: %s", exc)
            raise


@app.get("/api/prompt")
def prompt() -> dict[str, str]:
    ensure_bootstrap_started()
    today = dt.datetime.now().astimezone().date().isoformat()
    last_updated = _last_updated() or "never"
    return {
        "prompt": "\n".join(
            [
                "Follow skill/SKILL.md end-to-end to produce today's LLM-Dash update.",
                f"Repo: {ROOT}",
                f"Date: {today}",
                f"Last successful update: {last_updated}",
                "Budget: no hard cap - log tokens, cost, and duration per SKILL.md §7.",
                "Agent Provider: use configured BYOK provider if available; otherwise run from this CLI.",
            ]
        )
    }


@app.get("/api/bootstrap-status")
def bootstrap_status() -> dict[str, str]:
    ensure_bootstrap_started()
    return dict(_bootstrap_state)


@app.post("/api/open-terminal")
def open_terminal() -> dict[str, str | bool]:
    launcher = _open_terminal(ROOT)
    if not launcher:
        raise HTTPException(status_code=500, detail="No supported terminal launcher was found on this system.")
    return {"ok": True, "launcher": launcher}


@app.get("/api/provider")
def get_provider() -> dict[str, Any]:
    try:
        return public_provider_state()
    except ConfigError as exc:
        raise _http_error(exc)


@app.get("/api/provider-presets")
def get_provider_presets() -> dict[str, Any]:
    return _provider_presets()


@app.get("/api/provider/credentials")
def get_provider_credentials() -> dict[str, Any]:
    try:
        return discover_provider_credentials()
    except voidware_auth.VoidwareAuthError as exc:
        raise _http_error(exc)
    except ConfigError as exc:
        raise _http_error(exc)


@app.post("/api/provider")
def post_provider(payload: ProviderPayload) -> dict[str, Any]:
    try:
        save_provider(
            base_url=payload.base_url,
            api_key=payload.api_key,
            models_override_url=payload.models_override_url,
            default_model=payload.default_model,
            backup_model=payload.backup_model,
            endpoint_mode=payload.endpoint_mode,
            request_headers=payload.request_headers if payload.request_headers is not None else load_provider_config().request_headers,
            provider_credential_name=payload.provider_credential_name,
            provider_credential_meta=payload.provider_credential_meta,
        )
        return public_provider_state()
    except ConfigError as exc:
        if isinstance(exc.__cause__, voidware_auth.VoidwareAuthError):
            raise _voidware_auth_http_error(exc.__cause__) from exc
        raise _http_error(exc)


@app.get("/api/voidware/broker")
def get_voidware_broker() -> dict[str, Any]:
    return voidware_auth.broker_status()


@app.post("/api/voidware/broker/stop")
def post_voidware_broker_stop() -> dict[str, Any]:
    try:
        return voidware_auth.stop_background_broker()
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc


def _validate_slot(slot: str) -> str:
    normalized = slot.strip().lower()
    if normalized not in CREDENTIAL_SLOTS:
        raise HTTPException(status_code=404, detail=f"Unknown credential slot: {slot}")
    return normalized


@app.get("/api/credentials/discovery")
def get_credentials_discovery() -> dict[str, Any]:
    try:
        return discover_all_credential_slots()
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.get("/api/credentials/slots")
def get_credentials_slots() -> dict[str, Any]:
    try:
        state = public_provider_state()
        return {
            "slots": state.get("credential_slots") or {},
            "auth": state.get("auth") or {},
        }
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.post("/api/credentials/slots/{slot}/select")
def post_credentials_slot_select(slot: str, payload: CredentialSlotSelectPayload) -> dict[str, Any]:
    slot = _validate_slot(slot)
    try:
        selection = select_credential_slot(
            slot,
            credential_name=payload.credential_name,
            credential_ref=payload.credential_ref,
            credential_meta=payload.credential_meta,
        )
        return {
            "slot": slot,
            "selection": {
                "name": selection.credential_name,
                "ref": voidware_auth.safe_credential_ref(selection.credential_ref),
                "meta": selection.credential_meta or {},
                "grant": selection.credential_grant or {},
                "grant_status": voidware_auth.grant_renewal_status(selection.credential_grant),
            },
        }
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.post("/api/credentials/slots/{slot}/save")
def post_credentials_slot_save(slot: str, payload: CredentialSlotSecretPayload) -> dict[str, Any]:
    slot = _validate_slot(slot)
    try:
        selection = save_slot_api_key(slot, payload.api_key)
        return {
            "slot": slot,
            "configured": True,
            "selection": {
                "name": selection.credential_name,
                "ref": voidware_auth.safe_credential_ref(selection.credential_ref),
                "meta": selection.credential_meta or {},
                "grant": selection.credential_grant or {},
            },
        }
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.post("/api/credentials/slots/{slot}/update")
def post_credentials_slot_update(slot: str, payload: CredentialSlotSecretPayload) -> dict[str, Any]:
    slot = _validate_slot(slot)
    try:
        selection = update_slot_api_key(
            slot,
            payload.api_key,
            external_mutation=payload.external_mutation,
            require_fresh_grant=payload.require_fresh_grant,
        )
        return {
            "slot": slot,
            "selection": {
                "name": selection.credential_name,
                "ref": voidware_auth.safe_credential_ref(selection.credential_ref),
                "meta": selection.credential_meta or {},
                "grant": selection.credential_grant or {},
            },
        }
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc, status_code=403 if "not managed by LLM-Dash" in str(exc) else 400)


@app.delete("/api/credentials/slots/{slot}/selection")
def delete_credentials_slot_selection(slot: str) -> dict[str, Any]:
    slot = _validate_slot(slot)
    try:
        clear_credential_slot_selection(slot)
        return {"slot": slot, "selection_cleared": True}
    except ConfigError as exc:
        raise _http_error(exc)


@app.delete("/api/credentials/slots/{slot}/credential")
def delete_credentials_slot_credential(
    slot: str,
    external_mutation: bool = False,
    require_fresh_grant: bool = False,
) -> dict[str, Any]:
    slot = _validate_slot(slot)
    try:
        delete_slot_credential(
            slot,
            external_mutation=external_mutation,
            require_fresh_grant=require_fresh_grant,
        )
        return {"slot": slot, "credential_deleted": True}
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc, status_code=403 if "not managed by LLM-Dash" in str(exc) else 400)


@app.post("/api/voidware/broker/grant")
def post_voidware_broker_grant(payload: VoidwareGrantPayload) -> dict[str, Any]:
    name = payload.credential_name.strip()
    ref = voidware_auth.safe_credential_ref(payload.credential_ref)
    if not name and not ref:
        raise _http_error(ValueError("credential_name or credential_ref is required."))
    try:
        result = voidware_auth.request_credential_access_grant(name or str(ref.get("name") or ""), credential_ref=ref or None)
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    if result.get("pending"):
        return {
            "ok": False,
            "code": result.get("code") or "approval_pending",
            "operation_id": result.get("operation_id"),
            "approval": result.get("approval") if isinstance(result.get("approval"), dict) else {},
        }
    grant = result.get("grant") if isinstance(result.get("grant"), dict) else {}
    return {"ok": True, "grant": grant}


@app.get("/api/voidware/broker/approval")
def get_voidware_broker_approval() -> dict[str, Any]:
    try:
        return voidware_auth.pending_approval()
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc


@app.post("/api/voidware/broker/approval")
def post_voidware_broker_approval(payload: VoidwareApprovalPayload) -> dict[str, Any]:
    try:
        result = voidware_auth.approve_pending_approval(password=payload.password, secret=payload.secret)
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    if result.get("pending"):
        return {
            "ok": False,
            "code": result.get("code") or "approval_pending",
            "operation_id": result.get("operation_id"),
            "approval": result.get("approval") if isinstance(result.get("approval"), dict) else {},
        }
    return {"ok": True, "grant": result.get("grant") if isinstance(result.get("grant"), dict) else {}}


@app.post("/api/voidware/broker/approval/deny")
def post_voidware_broker_approval_deny() -> dict[str, Any]:
    try:
        voidware_auth.deny_pending_approval()
    except voidware_auth.VoidwareAuthError as exc:
        if exc.code == "approval_denied":
            return {"ok": False, "code": exc.code, "message": str(exc)}
        raise _voidware_auth_http_error(exc) from exc
    return {"ok": True}


@app.get("/api/provider/test-connection")
async def test_provider_connection() -> dict[str, Any]:
    try:
        status_code, payload = await _fetch_provider_models()
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))
    return {"ok": status_code == 200, "status_code": status_code, "models_count": len(_normalize_models(payload))}


@app.post("/api/provider/test-connection")
async def test_provider_connection_payload(payload: ProviderPayload) -> dict[str, Any]:
    try:
        status_code, body = await _fetch_models_for_bundle(_bundle_from_payload(payload))
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))
    return {"ok": status_code == 200, "status_code": status_code, "models_count": len(_normalize_models(body))}


@app.get("/api/provider/models")
async def provider_models() -> dict[str, Any]:
    try:
        status_code, payload = await _fetch_provider_models()
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))
    if status_code != 200:
        raise HTTPException(status_code=502, detail=f"Provider models endpoint returned {status_code}.")
    return {"models": _normalize_models(payload)}


@app.post("/api/provider/test-model")
async def test_provider_model(payload: TestModelPayload) -> dict[str, Any]:
    import httpx

    try:
        bundle = load_provider_bundle()
        if not bundle.config.base_url:
            raise ConfigError("Agent Provider base_url is not configured.")
        target = payload.target or "default"
        if target not in {"default", "backup"}:
            raise ConfigError("target must be 'default' or 'backup'.")
        # An explicit model lets the UI probe the current dropdown selection
        # before it has been saved; fall back to the stored config otherwise.
        model = (payload.model or "").strip()
        if not model:
            model = bundle.config.backup_model if target == "backup" else bundle.config.default_model
        if not model:
            raise ConfigError(f"{target}_model is not configured.")
        body = {
            "model": model,
            "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
            "max_tokens": 8,
            "temperature": 0,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(bundle.chat_endpoint, headers=_provider_headers(), json=body)
        try:
            data = response.json()
        except ValueError:
            data = {}
        text = ""
        choices = data.get("choices") if isinstance(data, dict) else None
        if choices and isinstance(choices, list):
            first = choices[0] or {}
            message = first.get("message") or {}
            text = str(message.get("content") or first.get("text") or "")
        return {
            "ok": response.status_code == 200,
            "status_code": response.status_code,
            "target": target,
            "model": model,
            "output": text[:200],
        }
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))


@app.post("/api/exa")
def post_exa(payload: ExaPayload) -> dict[str, Any]:
    try:
        save_exa_api_key(payload.api_key)
        return {"exa_configured": True}
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.delete("/api/exa")
def delete_exa() -> dict[str, Any]:
    try:
        remove_exa_api_key()
        return {"exa_configured": False}
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/llmstats")
def post_llmstats(payload: LLMStatsPayload) -> dict[str, Any]:
    try:
        save_llmstats_api_key(payload.api_key)
        return {"llmstats_configured": True}
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.delete("/api/llmstats")
def delete_llmstats() -> dict[str, Any]:
    try:
        remove_llmstats_api_key()
        return {"llmstats_configured": False}
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/llmstats/test-connection")
async def test_llmstats_connection() -> dict[str, Any]:
    import httpx

    key = load_llmstats_api_key()
    if not key:
        raise HTTPException(status_code=400, detail="LLM Stats API key is not configured.")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{LLMSTATS_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
                params={"limit": "1"},
            )
        try:
            data: Any = response.json()
        except ValueError:
            data = {}
        models_count = 0
        if isinstance(data, dict):
            items = data.get("data") or data.get("models") or []
            models_count = len(items) if isinstance(items, list) else 0
        return {"ok": response.status_code == 200, "status_code": response.status_code, "models_count": models_count}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))


@app.post("/api/aa")
def post_aa(payload: AAPayload) -> dict[str, Any]:
    try:
        save_aa_api_key(payload.api_key)
        return {"aa_configured": True}
    except voidware_auth.VoidwareAuthError as exc:
        raise _voidware_auth_http_error(exc) from exc
    except ConfigError as exc:
        raise _http_error(exc)


@app.delete("/api/aa")
def delete_aa() -> dict[str, Any]:
    try:
        remove_aa_api_key()
        return {"aa_configured": False}
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/aa/test-connection")
async def test_aa_connection() -> dict[str, Any]:
    import httpx

    key = load_aa_api_key()
    if not key:
        raise HTTPException(status_code=400, detail="Artificial Analysis API key is not configured.")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{AA_BASE_URL}/language/models/free",
                headers={"x-api-key": key, "Accept": "application/json"},
            )
        if response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Artificial Analysis API rate limit exceeded. Free tier allows 100 requests/day.",
            )
        try:
            data: Any = response.json()
        except ValueError:
            data = {}
        models_count = 0
        if isinstance(data, list):
            models_count = len(data)
        elif isinstance(data, dict):
            items = data.get("data") or data.get("models") or []
            models_count = len(items) if isinstance(items, list) else 0
        return {"ok": response.status_code == 200, "status_code": response.status_code, "models_count": models_count}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_redact_known_secrets(str(exc)))


@app.delete("/api/provider/key")
def delete_provider_key() -> dict[str, Any]:
    try:
        remove_provider_api_key()
        return {"key_removed": True}
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/schedule")
def get_schedule() -> dict[str, Any]:
    return schedule_status()


@app.post("/api/schedule")
def post_schedule(payload: SchedulePayload) -> dict[str, Any]:
    try:
        return apply_schedule(payload.dict())
    except ScheduleError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/schedule")
def delete_schedule() -> dict[str, Any]:
    try:
        return remove_schedule()
    except ScheduleError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/run-update")
def run_update(payload: RunUpdatePayload | None = None) -> dict[str, str]:
    if _any_update_job_running():
        raise HTTPException(
            status_code=409,
            detail="An update or seed job is running. Wait for it to finish before starting another.",
        )
    try:
        bundle = load_provider_bundle()
        if not bundle.has_provider:
            raise ConfigError("Agent Provider requires base_url, api_key, and default_model.")
    except ConfigError as exc:
        raise _http_error(exc)

    job_id = uuid.uuid4().hex
    log_path = _job_log_path(job_id)
    log_path.parent.mkdir(exist_ok=True)
    started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = payload or RunUpdatePayload()
    command = [
        sys.executable,
        str(RUN_UPDATE_PATH),
        "--log-path",
        str(log_path),
        "--source-preset",
        payload.preset,
        "--source-count",
        str(payload.count),
        "--db-path",
        str(DB_PATH),
    ]
    if payload.index:
        command.extend(["--source-index", payload.index])
    if payload.prompt:
        command.extend(["--source-prompt", payload.prompt])
    if payload.endpoint:
        command.extend(["--source-endpoint", payload.endpoint])
    if payload.credential:
        command.extend(["--source-credential", payload.credential])
    log_file = log_path.open("a", encoding="utf-8")
    try:
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        log_file.close()
    except Exception as exc:
        log_file.close()
        raise HTTPException(status_code=500, detail=str(exc))

    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "state": "running",
            "started_at": started_at,
            "completed_at": None,
            "exit_code": None,
            "kind": "refresh",
            "source": payload.preset,
            "log_path": str(log_path.relative_to(ROOT)),
            "process": process,
            "tail": "",
        }
    watcher = threading.Thread(target=_watch_job, args=(job_id, process, log_path), name=f"llm-dash-run-{job_id}", daemon=True)
    watcher.start()
    return {"id": job_id, "state": "running"}


@app.get("/api/run-update/{job_id}")
def run_update_status(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _public_job(dict(_jobs.get(job_id) or {}))
    if not job:
        raise HTTPException(status_code=404, detail="Unknown update job.")
    log_path = ROOT / str(job["log_path"])
    if job["state"] == "running":
        job["tail"] = _job_tail(log_path, job)
    return job


@app.post("/api/run-update/{job_id}/cancel")
def cancel_run_update(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown update job.")
        if job.get("state") != "running":
            return _public_job(dict(job))
        process = job.get("process")
        job["cancel_requested"] = True
    if isinstance(process, subprocess.Popen):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
    with _jobs_lock:
        updated = _jobs.get(job_id) or job
        if updated.get("state") == "running":
            updated["state"] = "canceled"
            updated["completed_at"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            updated["exit_code"] = getattr(process, "returncode", None)
            updated.pop("process", None)
            updated["tail"] = _job_tail(ROOT / str(updated["log_path"]), updated)
        return _public_job(dict(updated))


@app.post("/api/seed")
def post_seed(payload: SeedPayload) -> dict[str, str]:
    if _any_update_job_running():
        raise HTTPException(
            status_code=409,
            detail="An update or seed job is running. Wait for it to finish before starting another.",
        )
    try:
        bundle = load_provider_bundle()
        if not bundle.has_provider:
            raise ConfigError("Agent Provider requires base_url, api_key, and default_model.")
    except ConfigError as exc:
        raise _http_error(exc)

    job_id = uuid.uuid4().hex
    log_path = _job_log_path(job_id)
    log_path.parent.mkdir(exist_ok=True)
    started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    command = [
        sys.executable,
        str(SEED_CATALOG_PATH),
        "--log-path",
        str(log_path),
        "--preset",
        payload.preset,
        "--count",
        str(payload.count),
        "--db-path",
        str(DB_PATH),
    ]
    if payload.index:
        command.extend(["--index", payload.index])
    if payload.prompt:
        command.extend(["--prompt", payload.prompt])
    if payload.endpoint:
        command.extend(["--endpoint", payload.endpoint])
    if payload.credential:
        command.extend(["--credential", payload.credential])
    log_file = log_path.open("a", encoding="utf-8")
    try:
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        log_file.close()
    except Exception as exc:
        log_file.close()
        raise HTTPException(status_code=500, detail=str(exc))

    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "state": "running",
            "started_at": started_at,
            "completed_at": None,
            "exit_code": None,
            "kind": "seed",
            "log_path": str(log_path.relative_to(ROOT)),
            "process": process,
            "tail": "",
        }
    watcher = threading.Thread(
        target=_watch_job,
        args=(job_id, process, log_path),
        name=f"llm-dash-seed-{job_id}",
        daemon=True,
    )
    watcher.start()
    return {"id": job_id, "state": "running"}


@app.post("/api/reset")
def post_reset(payload: ResetPayload) -> dict[str, Any]:
    """Scoped destructive reset for the same local operator who can run
    `llm-dash reset`. Requires a scope-specific typed confirm_token. Clears
    LLM-Dash broker grants on full reset only. Never deletes Voidware
    credentials or keyring secrets."""
    from scripts.reset_local_state import RESET_TOKENS, run_scope

    if _any_update_job_running():
        raise HTTPException(
            status_code=409,
            detail="An update or seed job is running. Wait for it to finish before resetting.",
        )

    scope = (payload.scope or "").strip().lower()
    if scope not in RESET_TOKENS:
        raise HTTPException(status_code=400, detail="Unknown reset scope.")
    if (payload.confirm_token or "").strip() != RESET_TOKENS[scope]:
        raise HTTPException(status_code=400, detail=f"Type {RESET_TOKENS[scope]} to confirm this reset.")
    try:
        summary = run_scope(scope)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc))
    if scope == "full":
        # The DB was deleted; next bootstrap status returns needs_setup so the UI routes into setup.
        ensure_bootstrap_started()
    return {"ok": True, **summary}


@app.get("/api/meta")
def get_meta(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    return {"last_updated": _last_updated()}


app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/changelogs", StaticFiles(directory=CHANGELOGS_DIR), name="changelogs")
if ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
