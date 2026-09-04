"""The canonical machine format.

OWNERSHIP: P2 owns this file. P3 wrote a working version at hour 3.

Every non-terminal surface consumes this: SARIF conversion, the VS Code
extension, the n8n control plane, and the dashboard. KEEP THE SHAPE STABLE
after hour 8 - four other things parse it.
"""

from __future__ import annotations

import json as _json

from leakguard.core.finding import Finding

SCHEMA_VERSION = "1.0"


def build(
    findings: list[Finding],
    *,
    files_scanned: int = 0,
    duration_ms: int = 0,
    repo: str | None = None,
    commit: str | None = None,
    branch: str | None = None,
    pr_number: int | None = None,
) -> dict:
    counts = {"definite": 0, "likely": 0, "possible": 0, "safe": 0}
    for f in findings:
        counts[f.confidence.value] += 1

    payload: dict = {
        "version": SCHEMA_VERSION,
        "summary": {
            **counts,
            "total": len(findings),
            "files_scanned": files_scanned,
            "duration_ms": duration_ms,
        },
        "findings": [f.to_dict() for f in findings],
    }

    # Context is attached only in CI, and carries no source code.
    ctx = {
        k: v
        for k, v in (
            ("repo", repo),
            ("commit", commit),
            ("branch", branch),
            ("pr_number", pr_number),
        )
        if v is not None
    }
    if ctx:
        payload["context"] = ctx

    return payload


def render(findings: list[Finding], **kwargs) -> str:
    return _json.dumps(build(findings, **kwargs), indent=2)
