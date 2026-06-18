from __future__ import annotations

import datetime as dt
import json
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from .browser import open_url
from . import __version__
from .paths import DEFAULT_LOG_PATH, ROOT, SERVER_STATE_PATH, venv_python


@dataclass
class ServerStatus:
    state: str
    running: bool
    managed: bool
    url: str
    host: str
    port: int
    pid: int | None = None
    uptime_sec: float | None = None
    log_path: str | None = None
    root: str = str(ROOT)
    message: str = ""
    version: str = __version__
    state_version: int = 1
    venv_path: str = str(venv_python())
    last_error: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "running": self.running,
            "managed": self.managed,
            "url": self.url,
            "host": self.host,
            "port": self.port,
            "pid": self.pid,
            "uptime_sec": self.uptime_sec,
            "log_path": self.log_path,
            "root": self.root,
            "message": self.message,
            "version": self.version,
            "state_version": self.state_version,
            "venv_path": self.venv_path,
            "last_error": self.last_error,
        }


def url_host(host: str) -> str:
    if host == "0.0.0.0":
        return _primary_ipv4()
    if host == "::":
        return "[::1]"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def probe_host(host: str) -> str:
    if host == "0.0.0.0":
        return "127.0.0.1"
    if host == "::":
        return "[::1]"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def display_url(host: str, port: int) -> str:
    return f"http://{url_host(host)}:{port}"


def probe_url(host: str, port: int) -> str:
    return f"http://{probe_host(host)}:{port}/api/bootstrap-status"


def _primary_ipv4() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    return "127.0.0.1"


def _ready(url: str) -> bool:
    try:
        with urlopen(url, timeout=0.75) as response:
            return 200 <= response.status < 500
    except (OSError, URLError):
        return False


def _port_open(host: str, port: int) -> bool:
    target = "127.0.0.1" if host in {"0.0.0.0", "::"} else host.strip("[]")
    try:
        with socket.create_connection((target, port), timeout=0.4):
            return True
    except OSError:
        return False


def wait_until_ready(host: str, port: int, process: subprocess.Popen[Any] | None = None) -> bool:
    url = probe_url(host, port)
    for _ in range(80):
        if _ready(url):
            return True
        if process is not None and process.poll() is not None:
            return False
        time.sleep(0.25)
    return False


def _creationflags() -> int:
    if os.name != "nt":
        return 0
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        flags |= subprocess.CREATE_NO_WINDOW
    return flags


def _load_state() -> dict[str, Any]:
    try:
        return json.loads(SERVER_STATE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {"invalid": True}


def _write_state(process: subprocess.Popen[Any], host: str, port: int, log_path: Path) -> None:
    SERVER_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    create_time = None
    try:
        import psutil

        create_time = psutil.Process(process.pid).create_time()
    except Exception:
        create_time = time.time()
    data = {
        "version": 1,
        "pid": process.pid,
        "create_time": create_time,
        "host": host,
        "port": port,
        "url": display_url(host, port),
        "root": str(ROOT),
        "python": sys.executable,
        "log_path": str(log_path),
        "started_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    SERVER_STATE_PATH.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _remove_state() -> None:
    try:
        SERVER_STATE_PATH.unlink()
    except FileNotFoundError:
        pass


def _process_from_state(data: dict[str, Any]):
    pid = data.get("pid")
    if not isinstance(pid, int):
        return None
    try:
        import psutil

        proc = psutil.Process(pid)
        expected = data.get("create_time")
        if isinstance(expected, (int, float)) and abs(proc.create_time() - float(expected)) > 2:
            return None
        if not proc.is_running():
            return None
        try:
            cwd = Path(proc.cwd()).resolve()
            if cwd != ROOT:
                return None
        except Exception:
            cmdline = " ".join(proc.cmdline())
            if str(ROOT) not in cmdline and "server:app" not in cmdline:
                return None
        return proc
    except Exception:
        return None


def status(host: str | None = None, port: int | None = None, *, cleanup_stale: bool = False) -> ServerStatus:
    data = _load_state()
    if data and not data.get("invalid"):
        if (host is not None and str(data.get("host")) != host) or (port is not None and int(data.get("port") or 0) != int(port)):
            data = {}
    state_host = str(host or data.get("host") or os.environ.get("LLM_DASH_HOST") or "127.0.0.1")
    state_port = int(port or data.get("port") or os.environ.get("LLM_DASH_PORT") or 8787)
    url = str(data.get("url") or display_url(state_host, state_port))
    log_path = str(data.get("log_path") or DEFAULT_LOG_PATH)

    proc = _process_from_state(data) if data and not data.get("invalid") else None
    if proc is not None and _ready(probe_url(state_host, state_port)):
        uptime = max(0.0, time.time() - float(data.get("create_time") or proc.create_time()))
        return ServerStatus(
            state="running",
            running=True,
            managed=True,
            url=url,
            host=state_host,
            port=state_port,
            pid=proc.pid,
            uptime_sec=uptime,
            log_path=log_path,
            message="LLM-Dash is running.",
        )

    if data and cleanup_stale:
        _remove_state()
        return ServerStatus(
            state="stopped",
            running=False,
            managed=True,
            url=url,
            host=state_host,
            port=state_port,
            pid=data.get("pid") if isinstance(data.get("pid"), int) else None,
            log_path=log_path,
            message="Removed stale server state.",
        )
    if data:
        return ServerStatus(
            state="stale",
            running=False,
            managed=True,
            url=url,
            host=state_host,
            port=state_port,
            pid=data.get("pid") if isinstance(data.get("pid"), int) else None,
            log_path=log_path,
            message="Stored server state is stale.",
        )

    if _ready(probe_url(state_host, state_port)):
        return ServerStatus(
            state="running",
            running=True,
            managed=False,
            url=url,
            host=state_host,
            port=state_port,
            log_path=log_path,
            message="LLM-Dash is responding, but no managed pid state exists.",
        )

    return ServerStatus(
        state="stopped",
        running=False,
        managed=False,
        url=url,
        host=state_host,
        port=state_port,
        log_path=log_path,
        message="LLM-Dash is stopped.",
    )


def _uvicorn_command(host: str, port: int) -> list[str]:
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "server:app",
        "--host",
        host,
        "--port",
        str(port),
    ]


def start_background(host: str, port: int, *, log_path: Path = DEFAULT_LOG_PATH) -> tuple[int, str]:
    current = status(host, port, cleanup_stale=True)
    if current.running:
        return 0, current.url
    if _port_open(host, port):
        return 1, f"LLM-Dash: port {port} is already in use on {host}."

    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    with log_path.open("ab") as log:
        log.write(f"\n--- LLM-Dash server start: {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n".encode())
        process = subprocess.Popen(
            _uvicorn_command(host, port),
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=(os.name != "nt"),
            creationflags=_creationflags(),
        )

    _write_state(process, host, port, log_path)
    if wait_until_ready(host, port, process):
        return 0, display_url(host, port)

    if process.poll() is None:
        process.terminate()
    _remove_state()
    return 1, f"LLM-Dash: server did not come up in time; see {log_path}"


def start_foreground(host: str, port: int, *, open_browser: bool = True) -> int:
    current = status(host, port, cleanup_stale=True)
    if current.running:
        print(current.url)
        if open_browser:
            open_url(current.url)
        return 0
    if _port_open(host, port):
        print(f"LLM-Dash: port {port} is already in use on {host}.", file=sys.stderr)
        return 1

    process = subprocess.Popen(_uvicorn_command(host, port), cwd=ROOT)
    _write_state(process, host, port, DEFAULT_LOG_PATH)
    try:
        if wait_until_ready(host, port, process):
            url = display_url(host, port)
            print(f"LLM-Dash: running at {url}")
            if open_browser:
                open_url(url)
        else:
            print("LLM-Dash: server did not come up in time.", file=sys.stderr)
            return 1
        return process.wait()
    except KeyboardInterrupt:
        return 130
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        _remove_state()


def stop(*, timeout: float = 8.0) -> ServerStatus:
    data = _load_state()
    if not data:
        return status(cleanup_stale=True)
    proc = _process_from_state(data)
    if proc is None:
        _remove_state()
        return ServerStatus(
            state="stopped",
            running=False,
            managed=True,
            url=str(data.get("url") or display_url(str(data.get("host") or "127.0.0.1"), int(data.get("port") or 8787))),
            host=str(data.get("host") or "127.0.0.1"),
            port=int(data.get("port") or 8787),
            pid=data.get("pid") if isinstance(data.get("pid"), int) else None,
            log_path=str(data.get("log_path") or DEFAULT_LOG_PATH),
            message="Removed stale server state.",
        )

    try:
        import psutil

        children = proc.children(recursive=True)
        for child in children:
            child.terminate()
        proc.terminate()
        gone, alive = psutil.wait_procs([proc, *children], timeout=timeout)
        for item in alive:
            item.kill()
        if alive:
            psutil.wait_procs(alive, timeout=3)
    except Exception:
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    _remove_state()
    return ServerStatus(
        state="stopped",
        running=False,
        managed=True,
        url=str(data.get("url") or display_url(str(data.get("host") or "127.0.0.1"), int(data.get("port") or 8787))),
        host=str(data.get("host") or "127.0.0.1"),
        port=int(data.get("port") or 8787),
        pid=data.get("pid") if isinstance(data.get("pid"), int) else None,
        log_path=str(data.get("log_path") or DEFAULT_LOG_PATH),
        message="LLM-Dash stopped.",
    )
