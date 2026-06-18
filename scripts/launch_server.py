#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from llm_dash.paths import DEFAULT_LOG_PATH
from llm_dash.process import start_background


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch LLM-Dash server in the background.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--log-path", type=Path, default=DEFAULT_LOG_PATH)
    parser.add_argument("--pid-path", type=Path, help="Deprecated; managed state now lives under .llm-dash/server.json.")
    args = parser.parse_args()
    code, message = start_background(args.host, args.port, log_path=args.log_path)
    print(message)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
