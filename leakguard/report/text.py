"""Human-readable terminal output.

OWNERSHIP: P2 owns this file. P3 wrote a working version at hour 3 so the CLI
could ship end-to-end. Replace or refine freely - just keep `render()`'s
signature, since cli.py, the pre-commit hook and the Action all call it.
"""

from __future__ import annotations

import os
import sys

from leakguard.core.finding import Confidence, Finding

COLORS = {
    Confidence.DEFINITE: "\033[31m",  # red
    Confidence.LIKELY: "\033[33m",  # yellow
    Confidence.POSSIBLE: "\033[36m",  # cyan
    Confidence.SAFE: "\033[32m",  # green
}
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def _use_color(stream) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    return hasattr(stream, "isatty") and stream.isatty()


def render(
    findings: list[Finding],
    *,
    files_scanned: int = 0,
    duration_ms: int = 0,
    stream=None,
) -> str:
    stream = stream or sys.stdout
    color = _use_color(stream)

    def c(text: str, code: str) -> str:
        return f"{code}{text}{RESET}" if color else text

    out: list[str] = []

    for f in findings:
        head = (
            f"{c('LEAK', COLORS[f.confidence])} "
            f"({f.confidence.value}) - {f.resource} - "
            f"{c(f.file, BOLD)}:{f.function}"
        )
        out.append(head)
        out.append("")
        out.append(f"  opened   line {f.acquired_line:<5} {f.snippet}")

        if f.leak_path:
            arrow = " -> ".join(str(s.line) for s in f.leak_path)
            kind = f" ({f.exit_kind})" if f.exit_kind else ""
            out.append(f"  path     {arrow}{kind}")

        if f.reason:
            out.append(f"  reason   {f.reason}")

        if f.close_found_at:
            closes = ", ".join(str(n) for n in f.close_found_at)
            note = ""
            if f.close_unreachable_from is not None:
                note = f"   unreachable from line {f.close_unreachable_from}"
            out.append(f"  close    line {closes}{note}")
        elif f.confidence is not Confidence.POSSIBLE:
            out.append("  close    none found in this function")

        if f.escape_kind:
            out.append(c(f"  escapes  via {f.escape_kind} - not conclusive", DIM))

        if f.fix_available:
            out.append(c("  fix      available - run `leakguard fix --write`", DIM))

        out.append("")

    counts = {k: 0 for k in ("definite", "likely", "possible")}
    for f in findings:
        if f.confidence.value in counts:
            counts[f.confidence.value] += 1

    if findings:
        summary = ", ".join(f"{v} {k}" for k, v in counts.items() if v)
    else:
        summary = c("no leaks found", COLORS[Confidence.SAFE])

    out.append(f"{summary} - {files_scanned} files - {duration_ms}ms")
    return "\n".join(out)
