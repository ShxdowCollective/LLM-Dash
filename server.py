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
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"
CHANGELOGS_DIR = ROOT / "changelogs"
DB_PATH = DATA_DIR / "dash.sqlite"
INIT_DB_PATH = ROOT / "scripts" / "init_db.py"

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


def _set_bootstrap_state(state: str, message: str, detail: str = "") -> None:
    with _bootstrap_lock:
        _bootstrap_state["state"] = state
        _bootstrap_state["message"] = message
        _bootstrap_state["detail"] = detail


def _tail_output(stdout: str, stderr: str) -> str:
    lines = [line.strip() for line in (stdout + "\n" + stderr).splitlines() if line.strip()]
    return " | ".join(lines[-4:])


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


app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/changelogs", StaticFiles(directory=CHANGELOGS_DIR), name="changelogs")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
