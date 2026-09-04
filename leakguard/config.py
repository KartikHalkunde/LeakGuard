"""Configuration loading and merging.

Precedence, lowest to highest: built-in defaults -> .leakguard.toml -> CLI flags.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_EXCLUDES = [
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    ".git",
    "build",
    "dist",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
]


@dataclass
class Config:
    fail_on: str = "definite"
    exclude: list[str] = field(default_factory=lambda: list(DEFAULT_EXCLUDES))
    #: Extra resource definitions merged over the built-in catalog.
    resources: list[dict] = field(default_factory=list)
    baseline_path: Path = Path(".leakguard-baseline.json")
    #: Optional n8n control-plane base URL. Used only by CI, never by the hook.
    control_plane: str | None = None
    jobs: int = 0
    diff_only: bool = False
    diff_base: str | None = None

    def is_excluded(self, path: Path) -> bool:
        parts = set(path.parts)
        for pattern in self.exclude:
            cleaned = pattern.rstrip("/\\")
            if cleaned in parts or str(path).replace("\\", "/").startswith(
                cleaned.replace("\\", "/") + "/"
            ):
                return True
        return False


def load_config(path: str | Path = ".leakguard.toml") -> Config:
    """Load .leakguard.toml if present. A missing file is not an error."""
    cfg = Config()
    p = Path(path)
    if not p.exists():
        return cfg

    with p.open("rb") as fh:
        raw = tomllib.load(fh)

    section = raw.get("leakguard", {})
    if "fail_on" in section:
        cfg.fail_on = section["fail_on"]
    if "exclude" in section:
        cfg.exclude = list(DEFAULT_EXCLUDES) + list(section["exclude"])
    if "baseline" in section:
        cfg.baseline_path = Path(section["baseline"])
    if "control_plane" in section:
        cfg.control_plane = section["control_plane"]
    if "jobs" in section:
        cfg.jobs = int(section["jobs"])

    # [[leakguard.resources]] tables
    cfg.resources = list(section.get("resources", []))
    return cfg


def merge_cli(cfg: Config, args) -> Config:
    """Overlay CLI flags on top of file config. CLI always wins."""
    if getattr(args, "fail_on", None):
        cfg.fail_on = args.fail_on
    if getattr(args, "baseline", None):
        cfg.baseline_path = Path(args.baseline)
    if getattr(args, "jobs", None):
        cfg.jobs = args.jobs
    if getattr(args, "diff_only", False):
        cfg.diff_only = True
    if getattr(args, "diff_base", None):
        cfg.diff_base = args.diff_base
    return cfg
