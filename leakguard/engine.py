"""Stable analysis seam shared by the CLI, editor and CI surfaces."""

from __future__ import annotations

from pathlib import Path

from leakguard.core.finding import Finding, sort_findings
from leakguard.core.pipeline import run_pipeline


def analyze(paths: list[Path], config) -> list[Finding]:
    """Analyze files with the production AST/CFG engine, most severe first."""
    return sort_findings(run_pipeline(paths, config))
