"""Stable finding types shared by every LeakGuard surface."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import re
from typing import Any


class Confidence(str, Enum):
    DEFINITE = "definite"
    LIKELY = "likely"
    POSSIBLE = "possible"
    SAFE = "safe"


ORDER = {
    Confidence.DEFINITE: 3,
    Confidence.LIKELY: 2,
    Confidence.POSSIBLE: 1,
    Confidence.SAFE: 0,
}


@dataclass(frozen=True)
class PathStep:
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
    acquired_col: int
    snippet: str
    leak_path: list[PathStep] = field(default_factory=list)
    close_found_at: list[int] = field(default_factory=list)
    close_unreachable_from: int | None = None
    exit_kind: str = "return"
    reason: str = ""
    fix_available: bool = False
    severity: str = "medium"
    ordinal: int = 0
    escape_kind: str | None = None
    block_path: list[int] = field(default_factory=list)

    @property
    def fingerprint(self) -> str:
        """A content fingerprint resilient to line shifts and formatting."""

        norm = re.sub(r"\s+", " ", self.snippet).strip()
        norm = re.sub(r"'[^']*'|\"[^\"]*\"", "STR", norm)
        key = f"{self.file}:{self.function}:{self.resource}:{norm}:{self.ordinal}"
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    def to_dict(self) -> dict[str, Any]:
        """Return the canonical, JSON-serialisable finding shape."""

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
            "escape_kind": self.escape_kind,
            "block_path": self.block_path,
        }
