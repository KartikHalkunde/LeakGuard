"""Human-readable terminal rendering for findings."""

from __future__ import annotations

import os
from collections.abc import Iterable

from leakguard.core.finding import Confidence, Finding


_COLOURS = {
    Confidence.DEFINITE: "\033[31m",
    Confidence.LIKELY: "\033[33m",
    Confidence.POSSIBLE: "\033[36m",
}
_RESET = "\033[0m"


def _label(confidence: Confidence, colour: bool) -> str:
    label = f"LEAK ({confidence.value})"
    return f"{_COLOURS.get(confidence, '')}{label}{_RESET}" if colour else label


def render(findings: Iterable[Finding], *, files_scanned: int = 0, duration_ms: int = 0, colour: bool | None = None) -> str:
    findings = list(findings)
    if colour is None:
        colour = not bool(os.environ.get("NO_COLOR"))
    sections: list[str] = []
    for finding in findings:
        lines = [
            f"{_label(finding.confidence, colour)} · {finding.resource} · {finding.file}:{finding.function}",
            "",
            f"  opened   line {finding.acquired_line}    {finding.snippet}",
        ]
        if finding.leak_path:
            path = " → ".join(str(step.line) for step in finding.leak_path)
            lines.append(f"  path     {path} ({finding.exit_kind})")
        lines.append(f"  reason   {finding.reason}")
        for line in finding.close_found_at:
            suffix = f"    unreachable from block {finding.close_unreachable_from}" if finding.close_unreachable_from is not None else ""
            lines.append(f"  close    line {line}{suffix}")
        sections.append("\n".join(lines))
    counts = {confidence: sum(f.confidence is confidence for f in findings) for confidence in Confidence}
    sections.append(
        f"{counts[Confidence.DEFINITE]} definite, {counts[Confidence.LIKELY]} likely, "
        f"{counts[Confidence.POSSIBLE]} possible · {files_scanned} files · {duration_ms}ms"
    )
    return "\n\n".join(sections) + "\n"
