"""Findings — the contract between the engine and every output surface.

TEAM CONTRACT: agreed in hours 0-2. P2 owns further changes to this file.
P3 wrote the initial version so the CLI could ship at hour 4.

Everything downstream of `Finding` (reporters, SARIF, VS Code, n8n, the
dashboard) depends only on this class. Nothing downstream needs to know a
control-flow graph ever existed. Keep it stable after hour 8.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from enum import Enum


class Confidence(str, Enum):
    DEFINITE = "definite"
    LIKELY = "likely"
    POSSIBLE = "possible"
    SAFE = "safe"


#: Severity ordering, used for --fail-on thresholds.
ORDER: dict[str, int] = {
    Confidence.SAFE.value: 0,
    Confidence.POSSIBLE.value: 1,
    Confidence.LIKELY.value: 2,
    Confidence.DEFINITE.value: 3,
}


@dataclass
class PathStep:
    """One step of the witness path from acquisition to a leaking exit."""

    line: int
    note: str


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
    block_path: list[int] = field(default_factory=list)  # for P1's Mermaid

    @property
    def fingerprint(self) -> str:
        """Content-based identity, stable across reformatting.

        Deliberately excludes line numbers: a line-based fingerprint breaks
        the moment someone runs `black`, and the baseline ratchet dies with
        it. `ordinal` disambiguates two identical acquisitions in one
        function.
        """
        norm = re.sub(r"\s+", " ", self.snippet).strip()
        norm = re.sub(r"'[^']*'|\"[^\"]*\"", "STR", norm)
        key = f"{self.file}:{self.function}:{self.resource}:{norm}:{self.ordinal}"
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    @property
    def rank(self) -> int:
        return ORDER[self.confidence.value]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["confidence"] = self.confidence.value
        d["fingerprint"] = self.fingerprint
        d["acquired_at"] = {
            "line": self.acquired_line,
            "col": self.acquired_col,
            "snippet": self.snippet,
        }
        for k in ("acquired_line", "acquired_col", "snippet"):
            d.pop(k, None)
        return d


def sort_findings(findings: list[Finding]) -> list[Finding]:
    """Most severe first, then by file and line — stable output ordering."""
    return sorted(findings, key=lambda f: (-f.rank, f.file, f.acquired_line))
