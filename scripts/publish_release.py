#!/usr/bin/env python3
"""Cut a GitHub release for LLM-Dash: build curated assets, tag, and publish.

Wraps the last mile around ``scripts/build_release.py``:

  1. build the curated ``.zip`` / ``.tar.gz`` / ``SHA256SUMS.txt`` into ``dist/``
  2. create + push an annotated git tag at HEAD (skippable)
  3. ``gh release create`` with the assets and notes pulled from CHANGELOG.md

No GitHub Actions — this is a documented local command a maintainer runs by hand
(see AGENTS.md). Requires the ``gh`` CLI, authenticated (``gh auth login``).
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"
BUILD_SCRIPT = ROOT / "scripts" / "build_release.py"
CHANGELOG = ROOT / "CHANGELOG.md"
PYPROJECT = ROOT / "pyproject.toml"

VERSION_RE = re.compile(r"^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")


def fail(msg: str) -> "SystemExit":
    return SystemExit(f"error: {msg}")


def run(cmd: list[str], *, dry_run: bool, capture: bool = False) -> str:
    pretty = " ".join(cmd)
    if dry_run:
        print(f"  would run: {pretty}")
        return ""
    print(f"  $ {pretty}")
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=capture)
    if result.returncode != 0:
        if capture and result.stderr:
            sys.stderr.write(result.stderr)
        raise fail(f"command failed ({result.returncode}): {pretty}")
    return (result.stdout or "").strip()


def git_out(args: list[str]) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    return (result.stdout or "").strip()


def working_tree_dirty() -> bool:
    return bool(git_out(["status", "--porcelain"]))


def tag_exists(tag: str) -> bool:
    return git_out(["tag", "--list", tag]) == tag


def pyproject_version() -> str | None:
    if not PYPROJECT.exists():
        return None
    m = re.search(r'(?m)^version\s*=\s*"([^"]+)"', PYPROJECT.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def changelog_notes(version: str) -> str | None:
    """Extract the body under ``## [X.Y.Z]`` for a ``vX.Y.Z`` tag, if present."""
    if not CHANGELOG.exists():
        return None
    bare = version[1:] if version.startswith("v") else version
    lines = CHANGELOG.read_text(encoding="utf-8").splitlines()
    start = next(
        (i for i, ln in enumerate(lines) if ln.startswith(f"## [{bare}]")),
        None,
    )
    if start is None:
        return None
    body: list[str] = []
    for ln in lines[start + 1 :]:
        if ln.startswith("## ["):
            break
        # Drop Keep-a-Changelog link-reference definitions ("[1.0.0]: https://...").
        if re.match(r"^\[[^\]]+\]:\s+\S+", ln):
            continue
        body.append(ln)
    text = "\n".join(body).strip()
    return text or None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build and publish a GitHub release for LLM-Dash.")
    parser.add_argument("--version", required=True, help="Release tag, e.g. v1.0.0")
    parser.add_argument("--draft", action="store_true", help="Create the release as a draft")
    parser.add_argument(
        "--prerelease",
        action="store_true",
        help="Mark as a prerelease (auto-enabled for tags with a -suffix)",
    )
    parser.add_argument("--no-build", action="store_true", help="Reuse existing dist/ assets")
    parser.add_argument("--skip-tag", action="store_true", help="Assume the tag already exists/pushed")
    parser.add_argument("--allow-dirty", action="store_true", help="Permit a dirty working tree")
    parser.add_argument("--remote", default="origin", help="Remote to push the tag to (default: origin)")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan without mutating anything")
    args = parser.parse_args(argv)

    version = args.version
    if not VERSION_RE.match(version):
        raise fail(f"invalid version {version!r}; expected vMAJOR.MINOR.PATCH (e.g. v1.0.0)")

    if shutil.which("gh") is None:
        raise fail("the GitHub CLI (gh) is not installed — see https://cli.github.com")
    if not args.dry_run:
        auth = subprocess.run(["gh", "auth", "status"], cwd=ROOT, capture_output=True, text=True)
        if auth.returncode != 0:
            raise fail("gh is not authenticated — run `gh auth login` first")

    prerelease = args.prerelease or ("-" in version[1:])

    # Soft version sanity check against pyproject.
    proj = pyproject_version()
    if proj and proj != version[1:].split("-")[0]:
        print(f"warning: tag {version} != pyproject version {proj} — proceeding anyway")

    if not args.dry_run and not args.allow_dirty and working_tree_dirty():
        raise fail("working tree has uncommitted changes (use --allow-dirty to override)")

    if not args.dry_run and not args.skip_tag and not args.draft:
        # gh refuses to publish a release for an unpushed tag; the draft path is lenient.
        remotes = git_out(["remote"])
        if args.remote not in remotes.split():
            raise fail(f"remote {args.remote!r} not found (have: {remotes or 'none'})")

    print(f"==> Building release assets for {version}")
    if args.no_build:
        print("  (skipped --no-build)")
    else:
        run([sys.executable, str(BUILD_SCRIPT), "--version", version], dry_run=args.dry_run)

    assets = [
        DIST_DIR / f"llm-dash-{version}.zip",
        DIST_DIR / f"llm-dash-{version}.tar.gz",
        DIST_DIR / "SHA256SUMS.txt",
    ]
    if not args.dry_run:
        missing = [a.name for a in assets if not a.exists()]
        if missing:
            raise fail(f"expected assets not found in {DIST_DIR}: {', '.join(missing)}")

    print(f"==> Tagging {version}")
    if args.skip_tag:
        print("  (skipped --skip-tag)")
    elif not args.dry_run and tag_exists(version):
        print(f"  tag {version} already exists locally — reusing")
    else:
        run(["git", "tag", "-a", version, "-m", version], dry_run=args.dry_run)
    if not args.skip_tag and not args.draft:
        run(["git", "push", args.remote, version], dry_run=args.dry_run)

    print(f"==> Creating GitHub release {version}")
    notes = changelog_notes(version)
    gh_cmd = ["gh", "release", "create", version, *[str(a) for a in assets], "--title", version]
    if notes:
        gh_cmd += ["--notes", notes]
    else:
        print("  no CHANGELOG section found — using gh --generate-notes")
        gh_cmd += ["--generate-notes"]
    if args.draft:
        gh_cmd += ["--draft"]
    if prerelease:
        gh_cmd += ["--prerelease"]
    run(gh_cmd, dry_run=args.dry_run)

    print(f"\nDone. {'(dry run — nothing changed)' if args.dry_run else f'Released {version}.'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
