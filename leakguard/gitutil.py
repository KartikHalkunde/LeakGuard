"""Git helpers for --diff-only and CI context. P3 owns this file.

`--diff-only` is what keeps PR analysis O(changed files) instead of O(repo),
which is what keeps us inside the sub-second budget a pre-commit hook needs.

Every function here degrades gracefully: no git, no remote, shallow clone, or
a detached HEAD must never crash the analyzer.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

CANDIDATE_BASES = ("origin/main", "origin/master", "main", "master")


def _git(*args: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def is_repo() -> bool:
    return _git("rev-parse", "--is-inside-work-tree") == "true"


def resolve_base(explicit: str | None = None) -> str | None:
    """Pick a sensible diff base: explicit flag, CI env, or a default branch."""
    if explicit:
        return explicit

    # GitHub Actions sets this on pull_request events.
    gh_base = os.environ.get("GITHUB_BASE_REF")
    if gh_base:
        for candidate in (f"origin/{gh_base}", gh_base):
            if _git("rev-parse", "--verify", "--quiet", candidate):
                return candidate

    for candidate in CANDIDATE_BASES:
        if _git("rev-parse", "--verify", "--quiet", candidate):
            return candidate

    # Shallow clone or first commit: fall back to the previous commit.
    if _git("rev-parse", "--verify", "--quiet", "HEAD~1"):
        return "HEAD~1"
    return None


def changed_python_files(base: str | None = None) -> list[Path] | None:
    """Files added/copied/modified/renamed since `base`.

    Returns None when the diff cannot be computed, so the caller can fall
    back to a full scan rather than silently analyzing nothing.
    """
    if not is_repo():
        return None

    ref = resolve_base(base)
    if not ref:
        return None

    merge_base = _git("merge-base", ref, "HEAD") or ref
    out = _git("diff", "--name-only", "--diff-filter=ACMR", merge_base, "HEAD")
    if out is None:
        return None

    files = [Path(line) for line in out.splitlines() if line.endswith(".py")]
    return [p for p in files if p.exists()]


def staged_python_files() -> list[Path] | None:
    """Staged .py files - used when running as a pre-commit hook."""
    if not is_repo():
        return None
    out = _git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    if out is None:
        return None
    return [Path(p) for p in out.splitlines() if p.endswith(".py") and Path(p).exists()]


# -- CI context, attached to the control-plane payload (never source code) --


def current_repo() -> str | None:
    env = os.environ.get("GITHUB_REPOSITORY")
    if env:
        return env
    url = _git("config", "--get", "remote.origin.url")
    if not url:
        return None
    slug = url.removesuffix(".git")
    if ":" in slug and "//" not in slug:  # git@github.com:org/repo
        return slug.split(":", 1)[1]
    parts = slug.rstrip("/").split("/")
    return "/".join(parts[-2:]) if len(parts) >= 2 else None


def current_commit() -> str | None:
    return os.environ.get("GITHUB_SHA") or _git("rev-parse", "HEAD")


def current_branch() -> str | None:
    ref = os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME")
    if ref:
        return ref
    name = _git("rev-parse", "--abbrev-ref", "HEAD")
    return None if name == "HEAD" else name


def current_pr_number() -> int | None:
    """Parse refs/pull/123/merge from GITHUB_REF."""
    ref = os.environ.get("GITHUB_REF", "")
    parts = ref.split("/")
    if len(parts) >= 3 and parts[1] == "pull":
        try:
            return int(parts[2])
        except ValueError:
            return None
    return None


def current_actor() -> str | None:
    """GitHub user responsible for the push or pull-request update."""
    return os.environ.get("GITHUB_ACTOR")


def current_event() -> str | None:
    return os.environ.get("GITHUB_EVENT_NAME")


def current_base_sha() -> str | None:
    return os.environ.get("LEAKGUARD_BASE_SHA") or os.environ.get("GITHUB_BASE_SHA")


def current_run_url() -> str | None:
    server = os.environ.get("GITHUB_SERVER_URL")
    repo = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    return f"{server}/{repo}/actions/runs/{run_id}" if server and repo and run_id else None
