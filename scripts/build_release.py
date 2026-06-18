#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import os
import subprocess
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"

EXCLUDE_PATTERNS = [
    ".git",
    ".git/*",
    ".codex",
    ".codex/*",
    ".github/workflows",
    ".github/workflows/*",
    ".venv",
    ".venv/*",
    ".pytest_cache",
    ".pytest_cache/*",
    ".llm-dash",
    ".llm-dash/*",
    ".kilo",
    ".kilo/*",
    "node_modules",
    "node_modules/*",
    ".env",
    ".env.*",
    ".npmrc",
    "data/dash.sqlite",
    "data/dash.sqlite-*",
    "data/run_metrics.csv",
    "logs",
    "logs/*",
    "docs/plans",
    "docs/plans/*",
    "docs/logbooks",
    "docs/logbooks/*",
    "LOGBOOK.md",
    "artifacts",
    "artifacts/*",
    "references",
    "references/*",
    "test-results",
    "test-results/*",
    "playwright-report",
    "playwright-report/*",
    "e2e/reports",
    "e2e/reports/*",
    "e2e/.tmp",
    "e2e/.tmp/*",
    "e2e/screenshots",
    "e2e/screenshots/*",
    "E2E_AUDIT_REPORT.md",
    "dist",
    "dist/*",
    "__pycache__",
    "*/__pycache__/*",
    "*.pyc",
]

EXCLUDE_PREFIXES = [
    ".git/",
    ".codex/",
    ".github/workflows/",
    ".venv/",
    ".pytest_cache/",
    ".llm-dash/",
    ".kilo/",
    "node_modules/",
    "logs/",
    "docs/plans/",
    "docs/logbooks/",
    "artifacts/",
    "references/",
    "test-results/",
    "playwright-report/",
    "e2e/reports/",
    "e2e/.tmp/",
    "e2e/screenshots/",
    "e2e/audit/output/",
    "dist/",
    ".shxdow/",
]

REQUIRED_PATHS = [
    "pyproject.toml",
    "requirements.txt",
    "llm_dash/cli.py",
    "llm_dash/install.py",
    "llm_dash/process.py",
    "install.sh",
    "install.ps1",
    "install.bat",
    "llm-dash",
    "llm-dash.cmd",
    "server.py",
    "scripts/schema.sql",
    "scripts/init_db.py",
    "scripts/seed_catalog.py",
    "scripts/reset_local_state.py",
    "scripts/build_release.py",
    "skill/SKILL.md",
    "docs/update_dashboard.md",
    "web/index.html",
    "web/app.js",
    "web/style.css",
    "web/vendor/sql-wasm.js",
    "web/vendor/sql-wasm.wasm",
    "data/.gitkeep",
    "changelogs/.gitkeep",
    ".env.example",
    "README.md",
    "LICENSE",
]


def _run_git(args: list[str]) -> list[str]:
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True)
    return [line for line in result.stdout.splitlines() if line]


def _filesystem_files() -> list[str]:
    files: list[str] = []
    for path in ROOT.rglob("*"):
        if path.is_file():
            files.append(path.relative_to(ROOT).as_posix())
    return files


def source_files() -> list[str]:
    try:
        files = _run_git(["ls-files", "--cached", "--others", "--exclude-standard"])
    except Exception:
        files = _filesystem_files()
    return sorted({f for f in files if not excluded(f) and (ROOT / f).is_file()})


def excluded(rel: str) -> bool:
    rel = rel.replace("\\", "/")
    if rel == ".env.example":
        return False
    if any(rel == prefix.rstrip("/") or rel.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
        return True
    parts = rel.split("/")
    if "__pycache__" in parts:
        return True
    if any(part.endswith(".egg-info") for part in parts):
        return True
    for pattern in EXCLUDE_PATTERNS:
        if fnmatch.fnmatch(rel, pattern):
            return True
    return False


def validate_manifest(files: list[str]) -> None:
    present = set(files)
    missing = [path for path in REQUIRED_PATHS if path not in present]
    if missing:
        raise SystemExit("Release manifest missing required files: " + ", ".join(missing))
    forbidden = [path for path in files if excluded(path)]
    if forbidden:
        raise SystemExit("Release manifest contains excluded files: " + ", ".join(forbidden[:20]))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_archives(version: str, files: list[str], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"llm-dash-{version}"
    zip_path = out_dir / f"{name}.zip"
    tar_path = out_dir / f"{name}.tar.gz"
    root_prefix = f"{name}/"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel in files:
            zf.write(ROOT / rel, root_prefix + rel)

    with tarfile.open(tar_path, "w:gz") as tf:
        for rel in files:
            tf.add(ROOT / rel, arcname=root_prefix + rel, recursive=False)

    sums_path = out_dir / "SHA256SUMS.txt"
    archives = [zip_path, tar_path]
    sums_path.write_text(
        "".join(f"{_sha256(path)}  {path.name}\n" for path in archives),
        encoding="utf-8",
    )
    return [*archives, sums_path]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build curated LLM-Dash release archives.")
    parser.add_argument("--version", required=True, help="Version/tag, e.g. v1.0.0")
    parser.add_argument("--out-dir", type=Path, default=DIST_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    files = source_files()
    validate_manifest(files)
    if args.dry_run:
        for rel in files:
            print(rel)
        return 0
    for path in build_archives(args.version, files, args.out_dir):
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
