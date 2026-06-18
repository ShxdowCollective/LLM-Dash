#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

pick_python() {
  for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

PYTHON="$(pick_python || true)"
if [ -z "$PYTHON" ]; then
  echo "LLM-Dash: no Python 3.10+ interpreter found. Install Python 3.10+ and retry." >&2
  exit 1
fi

exec "$PYTHON" -m llm_dash install "$@"
