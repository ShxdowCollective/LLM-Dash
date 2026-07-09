from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__
from .env import load_dotenv
from .install import ensure_environment, perform_install
from .paths import ROOT, running_from_venv, venv_python


def _host(value: str | None) -> str:
    return value or os.environ.get("LLM_DASH_HOST") or "127.0.0.1"


def _announce_access_token(host: str, port: int) -> None:
    """When binding off-loopback, the per-install access token is required. Print
    it (and a ready-to-use URL) so the LAN operator can reach the UI."""
    try:
        os.environ["LLM_DASH_BIND_HOST"] = host
        from scripts import server_auth
        from .process import url_host

        if not server_auth.token_required():
            return
        token = server_auth.load_or_create_token()
    except Exception:
        return
    base = f"http://{url_host(host)}:{port}"
    print(f"LLM-Dash: server is exposed on {host}; an access token is required.")
    print(f"  Open: {base}/?token={token}")
    print("  (or send 'Authorization: Bearer <token>' on API calls)")


def _port(value: int | None) -> int:
    return int(value or os.environ.get("LLM_DASH_PORT") or 8787)


def _reexec_if_needed(argv: list[str], *, silent: bool = False) -> None:
    py = ensure_environment(silent=silent)
    if not running_from_venv():
        os.execv(str(py), [str(py), "-m", "llm_dash", *argv])


def _run_reset(*, dry_run: bool = False) -> int:
    command = [sys.executable, str(ROOT / "scripts" / "reset_local_state.py")]
    if dry_run:
        command.append("--dry-run")
    return subprocess.run(command, cwd=ROOT).returncode


def _print_status(status, *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(status.as_dict(), indent=2, sort_keys=True))
        return
    print(status.message)
    print(f"State: {status.state}")
    print(f"URL: {status.url}")
    if status.pid is not None:
        print(f"PID: {status.pid}")
    print(f"Root: {status.root}")
    if status.log_path:
        print(f"Log: {status.log_path}")


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".llm-dash-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="llm-dash", description="Install and run the local LLM-Dash server.")
    parser.add_argument("--version", action="version", version=f"llm-dash {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    install = sub.add_parser("install", help="Prepare the local virtualenv and command shim.")
    install.add_argument("--silent", action="store_true")
    install.add_argument("--force", action="store_true")
    install.add_argument("--start", action="store_true", help="Start in the background after installing.")
    install.add_argument("--host")
    install.add_argument("--port", type=int)
    install.add_argument("--bin-dir", type=Path)

    start = sub.add_parser("start", help="Start the dashboard server.")
    start.add_argument("--silent", action="store_true", help="Run in the background and print only the URL.")
    start.add_argument("--host")
    start.add_argument("--port", type=int)
    start.add_argument("--no-open", action="store_true")
    start.add_argument("--reset", action="store_true")
    start.add_argument("--dry-run", action="store_true")

    stop = sub.add_parser("stop", help="Stop the managed dashboard server.")
    stop.add_argument("--timeout", type=float, default=8.0)
    stop.add_argument("--json", action="store_true")

    status = sub.add_parser("status", help="Show server status.")
    status.add_argument("--host")
    status.add_argument("--port", type=int)
    status.add_argument("--json", action="store_true")

    reset = sub.add_parser("reset", help="Reset local LLM-Dash state.")
    reset.add_argument("--dry-run", action="store_true")

    doctor = sub.add_parser("doctor", help="Check install health.")
    doctor.add_argument("--json", action="store_true")
    sub.add_parser("open", help="Open the running dashboard in a browser.")
    sub.add_parser("version", help="Print the LLM-Dash version.")
    return parser


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args_list = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(args_list)

    if args.command == "install":
        py = perform_install(silent=args.silent, force=args.force, bin_dir=args.bin_dir)
        if args.start:
            command = [str(py), "-m", "llm_dash", "start", "--silent", "--host", _host(args.host), "--port", str(_port(args.port))]
            return subprocess.run(command, cwd=ROOT).returncode
        if not args.silent:
            print("LLM-Dash: install complete.")
        return 0

    if args.command == "version":
        print(__version__)
        return 0

    if args.command in {"start", "reset"}:
        _reexec_if_needed(args_list, silent=getattr(args, "silent", False))

    if args.command == "start":
        if args.dry_run and not args.reset:
            parser.error("--dry-run requires --reset")
        if args.silent and args.reset:
            parser.error("--reset opens setup mode and cannot be combined with --silent")
        if args.reset:
            code = _run_reset(dry_run=args.dry_run)
            if args.dry_run or code:
                return code
        from .process import start_background, start_foreground

        host = _host(args.host)
        port = _port(args.port)
        _announce_access_token(host, port)
        if args.silent:
            code, message = start_background(host, port)
            print(message)
            return code
        return start_foreground(host, port, open_browser=not args.no_open)

    if args.command == "stop":
        from .process import stop

        result = stop(timeout=args.timeout)
        _print_status(result, as_json=args.json)
        return 0

    if args.command == "status":
        from .process import status

        result = status(args.host, args.port, cleanup_stale=True)
        _print_status(result, as_json=args.json)
        if result.state == "running" and not result.managed:
            return 1
        return 0 if result.state in {"running", "stopped"} else 1

    if args.command == "reset":
        return _run_reset(dry_run=args.dry_run)

    if args.command == "doctor":
        from .process import status

        checks = {
            "version": __version__,
            "root": str(ROOT),
            "python": sys.executable,
            "python_version": ".".join(str(part) for part in sys.version_info[:3]),
            "python_ok": sys.version_info >= (3, 10),
            "venv_python": str(venv_python()),
            "venv_exists": venv_python().exists(),
            "running_from_venv": running_from_venv(),
            "root_writable": _writable(ROOT / ".llm-dash"),
            "logs_writable": _writable(ROOT / "logs"),
            "npm_available": bool(shutil.which("npm")),
            "server": status().as_dict(),
        }
        if args.json:
            print(json.dumps(checks, indent=2, sort_keys=True))
        else:
            print(f"LLM-Dash {checks['version']}")
            print(f"Root: {checks['root']}")
            print(f"Python: {checks['python']}")
            print(f"Python OK: {checks['python_ok']} ({checks['python_version']})")
            print(f"Venv: {checks['venv_python']} ({'ok' if checks['venv_exists'] else 'missing'})")
            print(f"Writable: state={'ok' if checks['root_writable'] else 'no'} logs={'ok' if checks['logs_writable'] else 'no'}")
            print(f"npm: {'available' if checks['npm_available'] else 'not found'}")
            print(f"Server: {checks['server']['state']} {checks['server']['url']}")
        return 0 if checks["python_ok"] and checks["root_writable"] and checks["logs_writable"] else 1

    if args.command == "open":
        from .browser import open_url
        from .process import status

        result = status()
        if not result.running:
            print("LLM-Dash: server is not running.", file=sys.stderr)
            return 1
        open_url(result.url)
        return 0

    parser.error("unknown command")
    return 2
