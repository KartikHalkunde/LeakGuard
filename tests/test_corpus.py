"""Runs the labelled corpus in tests/corpus/ against the real analyze().

Each corpus file declares its expected verdict in a header comment:

    # EXPECT: CLEAN
    # EXPECT: LEAK var=<name> line=<n> confidence=definite|likely|possible

This file IS the specification P1 and P2 build the engine against (see
docs/P4-INTERFACE.md, Task 2). Until leakguard/core/pipeline.py exists,
analyze() falls back to engine.py's stub, so most leaky/ cases are expected
to fail here — that failure is the signal P1/P2 aim at, not a bug in the
harness. Report failures to them daily.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from leakguard import analyze
from leakguard.config import Config

CORPUS_ROOT = Path(__file__).parent / "corpus"

DIRECTIVE = re.compile(
    r"#\s*EXPECT:\s*(CLEAN|LEAK)(?:\s+var=(\S+))?"
    r"(?:\s+line=(\d+))?(?:\s+confidence=(\w+))?"
)


def expectations(path: Path) -> list[dict]:
    """Parse the # EXPECT: header(s) at the top of a corpus file."""
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = DIRECTIVE.match(line.strip())
        if not m:
            continue
        kind, var, line_no, conf = m.groups()
        if kind == "CLEAN":
            return []
        out.append(
            {
                "var": var,
                "line": int(line_no) if line_no else None,
                "confidence": conf,
            }
        )
    return out


def corpus_files() -> list[Path]:
    return sorted(CORPUS_ROOT.rglob("*.py"))


@pytest.mark.parametrize(
    "path", corpus_files(), ids=[str(p.relative_to(CORPUS_ROOT)) for p in corpus_files()]
)
def test_corpus_file(path: Path):
    expected = expectations(path)
    actual = analyze([path], Config())

    assert len(actual) == len(expected), (
        f"{path.relative_to(CORPUS_ROOT)}: expected {len(expected)} finding(s), "
        f"got {len(actual)}: {[a.variable for a in actual]}"
    )

    for exp, act in zip(expected, actual):
        if exp["var"] is not None:
            assert act.variable == exp["var"], (
                f"{path.relative_to(CORPUS_ROOT)}: expected var={exp['var']}, "
                f"got {act.variable}"
            )
        if exp["line"] is not None:
            assert act.acquired_line == exp["line"], (
                f"{path.relative_to(CORPUS_ROOT)}: expected line={exp['line']}, "
                f"got {act.acquired_line}"
            )
        if exp["confidence"] is not None:
            assert act.confidence.value == exp["confidence"], (
                f"{path.relative_to(CORPUS_ROOT)}: expected confidence="
                f"{exp['confidence']}, got {act.confidence.value}"
            )


def test_corpus_has_expected_shape():
    """Sanity check on the corpus itself, independent of the engine."""
    safe = list((CORPUS_ROOT / "safe").glob("*.py"))
    leaky = list((CORPUS_ROOT / "leaky").glob("*.py"))
    assert len(safe) == 15, f"expected 15 safe/ files, found {len(safe)}"
    assert len(leaky) == 10, f"expected 10 leaky/ files, found {len(leaky)}"

    for path in safe:
        assert expectations(path) == [], f"{path.name} is in safe/ but has a LEAK directive"
    for path in leaky:
        assert expectations(path) != [], f"{path.name} is in leaky/ but has no LEAK directive"
