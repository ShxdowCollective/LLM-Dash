#!/usr/bin/env bash
# LLM-Dash — POSIX launcher.
# Creates/uses a repo-local .venv, installs deps, starts uvicorn, opens the browser.

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

PORT="${LLM_DASH_PORT:-8787}"
URL="http://127.0.0.1:${PORT}"
VENV="${HERE}/.venv"

pick_python() {
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

SYS_PY="$(pick_python || true)"
if [ -z "${SYS_PY}" ]; then
  echo "LLM-Dash: no python3/python on PATH. Install Python 3.10+ and retry." >&2
  exit 1
fi

if [ ! -x "${VENV}/bin/python" ]; then
  echo "LLM-Dash: creating virtualenv at ${VENV}"
  if ! "${SYS_PY}" -m venv "${VENV}" 2>/dev/null; then
    echo "LLM-Dash: 'python -m venv' failed. On Debian/Ubuntu try 'sudo apt install python3-venv'." >&2
    exit 1
  fi
fi

PY="${VENV}/bin/python"
PIP="${VENV}/bin/pip"

"${PY}" -m pip install --quiet --upgrade pip >/dev/null
"${PIP}" install --quiet -r requirements.txt

open_browser() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "$url" >/dev/null 2>&1 &) || true
  elif command -v open >/dev/null 2>&1; then
    (open "$url" >/dev/null 2>&1 &) || true
  else
    echo "LLM-Dash: open ${url} in your browser."
  fi
}

wait_for_server() {
  local url="$1"
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

echo "LLM-Dash: starting uvicorn on ${URL}"
"${PY}" -m uvicorn server:app --host 127.0.0.1 --port "${PORT}" &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if wait_for_server "${URL}/api/bootstrap-status"; then
  open_browser "${URL}"
else
  echo "LLM-Dash: server did not come up in time; open ${URL} manually once it does."
fi

wait "${SERVER_PID}"
