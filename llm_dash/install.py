from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path
from typing import Any

from .paths import INSTALL_STATE_PATH, ROOT, venv_dir, venv_python


def _hash_file(path: Path) -> str:
    if not path.exists():
        return ""
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def install_hash() -> str:
    digest = hashlib.sha256()
    for rel in ("requirements.txt", "pyproject.toml"):
        digest.update(rel.encode())
        digest.update(_hash_file(ROOT / rel).encode())
    return digest.hexdigest()


def _read_install_state() -> dict[str, Any]:
    try:
        return json.loads(INSTALL_STATE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_install_state(state: dict[str, Any]) -> None:
    INSTALL_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    INSTALL_STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _run(command: list[str], *, silent: bool) -> None:
    kwargs: dict[str, Any] = {"cwd": ROOT, "check": True}
    if silent:
        kwargs.update({"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL})
    subprocess.run(command, **kwargs)


def ensure_environment(*, silent: bool = False, force: bool = False) -> Path:
    if sys.version_info < (3, 10):
        raise SystemExit("LLM-Dash requires Python 3.10 or newer.")
    desired_hash = install_hash()
    state = _read_install_state()
    py = venv_python()
    needs_install = force or not py.exists() or state.get("install_hash") != desired_hash

    if not needs_install:
        return py

    if not py.exists():
        if not silent:
            print(f"LLM-Dash: creating virtualenv at {venv_dir()}")
        venv.EnvBuilder(with_pip=True).create(venv_dir())
    elif not silent:
        print(f"LLM-Dash: refreshing virtualenv at {venv_dir()}")

    _run([str(py), "-m", "pip", "install", "--quiet", "--upgrade", "pip"], silent=silent)
    _run([str(py), "-m", "pip", "install", "--quiet", "-r", str(ROOT / "requirements.txt")], silent=silent)
    _run([str(py), "-m", "pip", "install", "--quiet", "--no-deps", "-e", str(ROOT)], silent=silent)

    _write_install_state(
        {
            "version": 1,
            "install_hash": desired_hash,
            "python": str(py),
            "root": str(ROOT),
            "updated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        }
    )
    return py


def default_bin_dir() -> Path:
    override = os.environ.get("LLM_DASH_INSTALL_BIN")
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "Programs" / "LLM-Dash" / "bin"
    return Path.home() / ".local" / "bin"


def write_path_shim(*, bin_dir: Path | None = None, silent: bool = False) -> Path:
    target_dir = (bin_dir or default_bin_dir()).expanduser()
    target_dir.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        shim = target_dir / "llm-dash.cmd"
        shim.write_text(
            "@echo off\r\n"
            f"\"{venv_python()}\" -m llm_dash %*\r\n",
            encoding="utf-8",
        )
    else:
        shim = target_dir / "llm-dash"
        shim.write_text(
            "#!/usr/bin/env bash\n"
            f"exec \"{venv_python()}\" -m llm_dash \"$@\"\n",
            encoding="utf-8",
        )
        shim.chmod(0o755)
    if not silent:
        print(f"LLM-Dash: installed command shim at {shim}")
    return shim


def path_contains(path: Path) -> bool:
    target = str(path.expanduser())
    return any(Path(part).expanduser() == Path(target) for part in os.environ.get("PATH", "").split(os.pathsep) if part)


def maybe_update_windows_path(bin_dir: Path, *, silent: bool = False) -> None:
    if os.name != "nt" or path_contains(bin_dir):
        return
    try:
        import ctypes
        import winreg

        key_path = "Environment"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
            try:
                current, value_type = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                current, value_type = "", winreg.REG_EXPAND_SZ
            parts = [part for part in str(current).split(os.pathsep) if part]
            if not any(Path(part).expanduser() == bin_dir for part in parts):
                parts.append(str(bin_dir))
                winreg.SetValueEx(key, "Path", 0, value_type, os.pathsep.join(parts))
        try:
            ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001A, 0, "Environment", 0, 1000, None)
        except Exception:
            pass
        if not silent:
            print("LLM-Dash: added shim directory to the user PATH. Open a new terminal if this one cannot find llm-dash.")
    except Exception:
        if not silent:
            print(f"LLM-Dash: add {bin_dir} to your user PATH if `llm-dash` is not found.")


def perform_install(*, silent: bool = False, force: bool = False, bin_dir: Path | None = None) -> Path:
    py = ensure_environment(silent=silent, force=force)
    shim = write_path_shim(bin_dir=bin_dir, silent=silent)
    if os.name == "nt":
        maybe_update_windows_path(shim.parent, silent=silent)
    elif not path_contains(shim.parent) and not silent:
        print(f"LLM-Dash: add {shim.parent} to PATH if `llm-dash` is not found in new shells.")
    return py


def find_system_python() -> str | None:
    if os.name == "nt":
        if shutil.which("py"):
            return "py -3"
        if shutil.which("python"):
            return "python"
        return None
    return shutil.which("python3") or shutil.which("python")
