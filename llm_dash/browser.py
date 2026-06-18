from __future__ import annotations

import os
import subprocess
import sys
import webbrowser


def open_url(url: str) -> None:
    if os.environ.get("LLM_DASH_NO_BROWSER"):
        return
    if sys.platform.startswith("linux"):
        try:
            subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    webbrowser.open(url)
