"""The integration seam between the CLI and the analysis engine.

P1 and P2 land `leakguard/core/pipeline.py` with a `run_pipeline(paths, config)`
function. Until it exists, `analyze()` falls back to a loud stub so the whole
CLI -> hook -> Action pipeline is testable from hour 4.

When P1+P2's pipeline lands, the stub disappears automatically. Nothing in
this file needs editing.
"""

from __future__ import annotations

import os
from pathlib import Path

from leakguard.core.finding import Confidence, Finding, PathStep, sort_findings

#: Files containing this marker produce a stub finding, so P3 can exercise the
#: hook and the Action against deliberate, controllable input before the real
#: engine exists. Remove the marker files once the engine lands.
#:
#: Assembled from two halves on purpose: written as one literal, this line
#: would itself contain the marker and the stub would flag its own source.
STUB_MARKER = "# LEAKGUARD_" + "STUB_LEAK"


def engine_available() -> bool:
    try:
        import leakguard.core.pipeline  # noqa: F401
    except ImportError:
        return False
    return True


def analyze(paths: list[Path], config) -> list[Finding]:
    """Analyze the given files and return findings, most severe first.

    This is the one function every surface calls: the CLI, the pre-commit
    hook, the GitHub Action, the VS Code extension and the n8n control plane
    all reach the engine through here.
    """
    if engine_available():
        from leakguard.core.pipeline import run_pipeline

        return sort_findings(run_pipeline(paths, config))

    if os.environ.get("LEAKGUARD_NO_STUB"):
        return []
    return sort_findings(_stub_findings(paths))


def _stub_findings(paths: list[Path]) -> list[Finding]:
    """Deterministic placeholder findings, driven by an explicit marker."""
    findings: list[Finding] = []
    for path in paths:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for i, line in enumerate(lines, start=1):
            if STUB_MARKER not in line:
                continue
            findings.append(
                Finding(
                    confidence=Confidence.DEFINITE,
                    resource="sqlite3.Connection",
                    file=str(path).replace("\\", "/"),
                    function="<stub>",
                    variable="conn",
                    acquired_line=i,
                    acquired_col=5,
                    snippet=line.strip(),
                    leak_path=[
                        PathStep(i, "conn opened here"),
                        PathStep(i + 1, "branch taken"),
                        PathStep(i + 2, "return - exits with conn still open"),
                    ],
                    close_found_at=[],
                    exit_kind="return",
                    reason=(
                        "STUB FINDING - the analysis engine is not wired up yet. "
                        "Reaches function exit with conn still open."
                    ),
                    fix_available=False,
                    severity="high",
                    ordinal=len(findings),
                )
            )
    return findings
