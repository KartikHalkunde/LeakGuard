"""The canonical machine format.

Every non-terminal surface consumes this: SARIF conversion, the VS Code
extension, the n8n control plane, and the dashboard. KEEP THE SHAPE STABLE —
four other things parse it.

Merged from the P2 and P3 branches. P3's version is kept because it carries
the `context` block (repo, commit, branch, pr_number) that the control-plane
ingest workflow needs in order to attribute a finding to a repo and a PR;
`build_report` remains as an alias so P2's call sites keep working.
"""

from __future__ import annotations

import json as _json
from collections.abc import Iterable

from leakguard.core.finding import Confidence, Finding

SCHEMA_VERSION = "1.0"


def build(
    findings: Iterable[Finding],
    *,
    files_scanned: int = 0,
    duration_ms: int = 0,
    repo: str | None = None,
    commit: str | None = None,
    branch: str | None = None,
    pr_number: int | None = None,
    actor: str | None = None,
    event: str | None = None,
    base_sha: str | None = None,
    run_url: str | None = None,
) -> dict:
    findings = list(findings)

    counts = {c.value: 0 for c in Confidence}
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
            ("actor", actor),
            ("event", event),
            ("base_sha", base_sha),
            ("run_url", run_url),
        )
        if v is not None
    }
    if ctx:
        payload["context"] = ctx

    return payload


#: Alias for the P2 branch's call sites.
build_report = build


def render(findings: Iterable[Finding], *, indent: int | None = 2, **kwargs) -> str:
    return _json.dumps(build(findings, **kwargs), indent=indent)
