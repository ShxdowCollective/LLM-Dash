#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import platform
import shlex
import sqlite3
import subprocess
import sys
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from scripts.config import (
    ConfigError,
    build_auth_headers,
    load_exa_api_key,
    load_provider_bundle,
    public_provider_state,
    save_exa_api_key,
    save_provider,
)

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"
CHANGELOGS_DIR = ROOT / "changelogs"
DB_PATH = DATA_DIR / "dash.sqlite"
INIT_DB_PATH = ROOT / "scripts" / "init_db.py"
RUN_UPDATE_PATH = ROOT / "scripts" / "run_update.py"
LOGS_DIR = ROOT / "logs"
PROVIDER_PRESETS_PATH = WEB_DIR / "provider-presets.json"

DATA_DIR.mkdir(exist_ok=True)
CHANGELOGS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="LLM-Dash")

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
    models_override_url: str = ""
    default_model: str = ""
    backup_model: str = ""
    endpoint_mode: str = "append_v1"
    request_headers: dict[str, str] = Field(default_factory=dict)


class TestModelPayload(BaseModel):
    target: str = "default"


class ExaPayload(BaseModel):
    api_key: str


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


def _redact_known_secrets(text: str) -> str:
    secrets: list[str] = []
    try:
        bundle = load_provider_bundle()
        if bundle.secrets.api_key:
            secrets.append(bundle.secrets.api_key)
    except Exception:
        pass
    try:
        exa_key = load_exa_api_key()
        if exa_key:
            secrets.append(exa_key)
    except Exception:
        pass
    redacted = text
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "***")
    return redacted


def _http_error(exc: Exception, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=str(exc))


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


async def _fetch_provider_models() -> tuple[int, Any]:
    import httpx

    bundle = load_provider_bundle()
    if not bundle.config.base_url:
        raise ConfigError("Agent Provider base_url is not configured.")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(bundle.models_endpoint, headers=_provider_headers())
    try:
        payload: Any = response.json()
    except ValueError:
        payload = {"text": response.text[:500]}
    return response.status_code, payload


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
        job["state"] = "succeeded" if exit_code == 0 else "failed"
        job["tail"] = _safe_tail(log_path)


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

    if not DB_PATH.exists():
        _set_bootstrap_state(
            "error",
            "Bootstrap finished, but dash.sqlite never appeared.",
            _tail_output(result.stdout, result.stderr),
        )
        return

    _set_bootstrap_state("ready", "Dashboard database ready.", "")


def ensure_bootstrap_started() -> None:
    global _bootstrap_thread

    if DB_PATH.exists() and _bootstrap_state["state"] != "initializing":
        _set_bootstrap_state("ready", "Dashboard database ready.", "")
        return

    with _bootstrap_lock:
        if DB_PATH.exists():
            _bootstrap_state["state"] = "ready"
            _bootstrap_state["message"] = "Dashboard database ready."
            _bootstrap_state["detail"] = ""
            return
        if _bootstrap_state["state"] == "error":
            return
        if _bootstrap_thread and _bootstrap_thread.is_alive():
            return
        _bootstrap_state["state"] = "initializing"
        _bootstrap_state["message"] = "Seeding dashboard database..."
        _bootstrap_state["detail"] = "Running scripts/init_db.py once for the first launch."
        _bootstrap_thread = threading.Thread(target=_run_bootstrap, name="llm-dash-bootstrap", daemon=True)
        _bootstrap_thread.start()


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
            request_headers=payload.request_headers,
        )
        return public_provider_state()
    except ConfigError as exc:
        raise _http_error(exc)


@app.get("/api/provider/test-connection")
async def test_provider_connection() -> dict[str, Any]:
    try:
        status_code, payload = await _fetch_provider_models()
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": status_code == 200, "status_code": status_code, "models_count": len(_normalize_models(payload))}


@app.get("/api/provider/models")
async def provider_models() -> dict[str, Any]:
    try:
        status_code, payload = await _fetch_provider_models()
    except ConfigError as exc:
        raise _http_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
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
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/exa")
def post_exa(payload: ExaPayload) -> dict[str, Any]:
    try:
        save_exa_api_key(payload.api_key)
        return {"exa_configured": True}
    except ConfigError as exc:
        raise _http_error(exc)


@app.post("/api/run-update")
def run_update() -> dict[str, str]:
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
    command = [sys.executable, str(RUN_UPDATE_PATH), "--log-path", str(log_path)]
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
            "log_path": str(log_path.relative_to(ROOT)),
            "tail": "",
        }
    watcher = threading.Thread(target=_watch_job, args=(job_id, process, log_path), name=f"llm-dash-run-{job_id}", daemon=True)
    watcher.start()
    return {"id": job_id, "state": "running"}


@app.get("/api/run-update/{job_id}")
def run_update_status(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = dict(_jobs.get(job_id) or {})
    if not job:
        raise HTTPException(status_code=404, detail="Unknown update job.")
    log_path = ROOT / str(job["log_path"])
    if job["state"] == "running":
        job["tail"] = _safe_tail(log_path)
    return job


app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/changelogs", StaticFiles(directory=CHANGELOGS_DIR), name="changelogs")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
