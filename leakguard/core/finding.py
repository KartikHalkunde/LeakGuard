"""Findings — the contract between the engine and every output surface.

TEAM CONTRACT. Everything downstream of `Finding` (reporters, SARIF, VS Code,
the n8n control plane, the dashboard) depends only on this class. Nothing
downstream needs to know a control-flow graph ever existed. Keep it stable.

Merged from the P2 and P3 branches: P2's explicit `to_dict` and frozen
`PathStep`, P3's `rank`/`sort_findings` (the CLI's --fail-on threshold and
stable output ordering) and defaults on `acquired_col`/`snippet`.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Confidence(str, Enum):
    DEFINITE = "definite"
    LIKELY = "likely"
    POSSIBLE = "possible"
    SAFE = "safe"


#: Severity ordering, used for --fail-on thresholds.
#:
#: Keyed by enum member. Because Confidence mixes in `str`, a plain-string
#: lookup such as ORDER["definite"] resolves to the same entry, which is what
#: cli.py relies on when it maps the --fail-on flag.
ORDER: dict[Confidence, int] = {
    Confidence.DEFINITE: 3,
    Confidence.LIKELY: 2,
    Confidence.POSSIBLE: 1,
    Confidence.SAFE: 0,
}


@dataclass(frozen=True)
class PathStep:
    """One step of the witness path from acquisition to a leaking exit."""

    line: int
    note: str

    def to_dict(self) -> dict[str, Any]:
        return {"line": self.line, "note": self.note}


@dataclass
class Finding:
    confidence: Confidence
    resource: str
    file: str
    function: str
    variable: str
    acquired_line: int
    acquired_col: int = 0
    snippet: str = ""
    leak_path: list[PathStep] = field(default_factory=list)
    close_found_at: list[int] = field(default_factory=list)
    close_unreachable_from: int | None = None
    exit_kind: str = "return"  # return | fallthrough | exception
    reason: str = ""
    fix_available: bool = False
    severity: str = "medium"
    ordinal: int = 0
    escape_kind: str | None = None
    block_path: list[int] = field(default_factory=list)  # for the Mermaid CFG

    @property
    def fingerprint(self) -> str:
        """Content-based identity, stable across reformatting.

        Deliberately excludes line numbers: a line-based fingerprint breaks
        the moment someone runs a formatter, and the baseline ratchet would
        die with it. `ordinal` disambiguates two identical acquisitions in
        one function.
        """
        norm = re.sub(r"\s+", " ", self.snippet).strip()
        norm = re.sub(r"'[^']*'|\"[^\"]*\"", "STR", norm)
        key = f"{self.file}:{self.function}:{self.resource}:{norm}:{self.ordinal}"
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    @property
    def rank(self) -> int:
        """Numeric severity, for --fail-on comparisons and sorting."""
        return ORDER[self.confidence]

    def to_dict(self) -> dict[str, Any]:
        """The canonical, JSON-serialisable finding shape."""
        return {
            "fingerprint": self.fingerprint,
            "confidence": self.confidence.value,
            "resource": self.resource,
            "file": self.file,
            "function": self.function,
            "variable": self.variable,
            "acquired_at": {
                "line": self.acquired_line,
                "col": self.acquired_col,
                "snippet": self.snippet,
            },
            "leak_path": [step.to_dict() for step in self.leak_path],
            "close_found_at": self.close_found_at,
            "close_unreachable_from": self.close_unreachable_from,
            "exit_kind": self.exit_kind,
            "reason": self.reason,
            "fix_available": self.fix_available,
            "severity": self.severity,
            "ordinal": self.ordinal,
            "escape_kind": self.escape_kind,
            "block_path": self.block_path,
        }


def sort_findings(findings: list[Finding]) -> list[Finding]:
    """Most severe first, then by file and line — stable output ordering."""
    return sorted(findings, key=lambda f: (-f.rank, f.file, f.acquired_line))
