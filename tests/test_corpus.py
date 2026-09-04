"""Runs the labelled corpus in tests/corpus/ against the real analyze().

Each corpus file declares its expected verdict in a header comment:

    # EXPECT: CLEAN
    # EXPECT: LEAK var=<name> line=<n> confidence=definite|likely|possible

This file IS the specification P1 and P2 build the engine against (see
docs/P4-INTERFACE.md, Task 2). Until leakguard/core/pipeline.py exists,
analyze() falls back to engine.py's stub, so leaky/ cases are expected to
fail — that failure is the signal P1/P2 aim at, not a bug in the harness.

Those expected failures are marked xfail(strict=False) while the engine is
stubbed, so CI stays green instead of going red on every push (a plain
`assert` failure looks identical to a real regression to `pytest -q`, and
the team convention is that main stays green). The marker is applied
automatically based on engine.engine_available() — once P1/P2 land
core/pipeline.py this stops firing on its own, and leaky/ cases start
reporting real pass/fail again. safe/ cases are never xfailed: those must
hold even against the stub.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from leakguard import analyze
from leakguard.bench import expectations
from leakguard.config import Config
from leakguard.engine import engine_available

CORPUS_ROOT = Path(__file__).parent / "corpus"
ENGINE_WIRED = engine_available()


def corpus_files() -> list[Path]:
    return sorted(CORPUS_ROOT.rglob("*.py"))


def _param(path: Path) -> pytest.param:
    marks = []
    if not ENGINE_WIRED and path.parent.name == "leaky":
        marks.append(
            pytest.mark.xfail(
                reason="core/pipeline.py not wired yet — analyze() is on the stub",
                strict=False,
            )
        )
    return pytest.param(path, marks=marks, id=str(path.relative_to(CORPUS_ROOT)))


@pytest.mark.parametrize("path", [_param(p) for p in corpus_files()])
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
