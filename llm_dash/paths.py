from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / ".llm-dash"
LOGS_DIR = ROOT / "logs"
DATA_DIR = ROOT / "data"
SERVER_STATE_PATH = STATE_DIR / "server.json"
INSTALL_STATE_PATH = STATE_DIR / "install.json"
DEFAULT_LOG_PATH = Path(os.environ["LLM_DASH_LOG_PATH"]).expanduser().resolve() if os.environ.get("LLM_DASH_LOG_PATH") else LOGS_DIR / "server.log"


def venv_dir() -> Path:
    return ROOT / ".venv"


def venv_python() -> Path:
    if os.name == "nt":
        return venv_dir() / "Scripts" / "python.exe"
    return venv_dir() / "bin" / "python"


def venv_script(name: str) -> Path:
    if os.name == "nt":
        return venv_dir() / "Scripts" / f"{name}.exe"
    return venv_dir() / "bin" / name


def running_from_venv() -> bool:
    try:
        return Path(sys.executable).resolve() == venv_python().resolve()
    except OSError:
        return False
