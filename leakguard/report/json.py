"""Canonical machine-readable LeakGuard report."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from leakguard.core.finding import Confidence, Finding


def build_report(
    findings: Iterable[Finding], *, files_scanned: int = 0, duration_ms: int = 0
) -> dict[str, Any]:
    findings = list(findings)
    summary = {confidence.value: 0 for confidence in Confidence if confidence is not Confidence.SAFE}
    for finding in findings:
        if finding.confidence is not Confidence.SAFE:
            summary[finding.confidence.value] += 1
    summary.update({"files_scanned": files_scanned, "duration_ms": duration_ms})
    return {"version": "1.0", "summary": summary, "findings": [finding.to_dict() for finding in findings]}


def render(findings: Iterable[Finding], *, files_scanned: int = 0, duration_ms: int = 0, indent: int | None = 2) -> str:
    return json.dumps(build_report(findings, files_scanned=files_scanned, duration_ms=duration_ms), indent=indent, sort_keys=False) + "\n"
