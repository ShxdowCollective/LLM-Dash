#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LOGS_DIR = ROOT / "logs"
DEFAULT_LOG_PATH = LOGS_DIR / "server.log"
DEFAULT_PID_PATH = LOGS_DIR / "server.pid"


def _url_host(host: str) -> str:
    if host == "0.0.0.0":
        return _primary_ipv4()
    if host == "::":
        return "[::1]"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def _probe_host(host: str) -> str:
    if host == "0.0.0.0":
        return "127.0.0.1"
    if host == "::":
        return "[::1]"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


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


def _wait_for_server(url: str, process: subprocess.Popen | None = None) -> bool:
    for _ in range(40):
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


def launch(host: str, port: int, log_path: Path, pid_path: Path) -> int:
    display_url = f"http://{_url_host(host)}:{port}"
    probe_url = f"http://{_probe_host(host)}:{port}/api/bootstrap-status"
    display_probe_url = f"{display_url}/api/bootstrap-status"
    ready_url = display_probe_url if host in {"0.0.0.0", "::"} else probe_url
    if _ready(probe_url) and _ready(ready_url):
        print(display_url)
        return 0

    log_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")

    with log_path.open("ab") as log:
        log.write(f"\n--- LLM-Dash server start: {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n".encode())
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "server:app",
                "--host",
                host,
                "--port",
                str(port),
            ],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=(os.name != "nt"),
            creationflags=_creationflags(),
        )

    pid_path.write_text(f"{process.pid}\n", encoding="utf-8")

    if _wait_for_server(ready_url, process):
        print(display_url)
        return 0

    if process.poll() is None:
        process.terminate()
    print(f"LLM-Dash: server did not come up in time; see {log_path}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch LLM-Dash server in the background.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--log-path", type=Path, default=DEFAULT_LOG_PATH)
    parser.add_argument("--pid-path", type=Path, default=DEFAULT_PID_PATH)
    args = parser.parse_args()
    return launch(args.host, args.port, args.log_path, args.pid_path)


if __name__ == "__main__":
    raise SystemExit(main())
