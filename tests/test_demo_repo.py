from pathlib import Path

from leakguard import analyze
from leakguard.config import Config
from leakguard.core.finding import Confidence


DEMO_APP = Path("demo-repo/app")


def test_demo_repo_has_expected_seeded_findings() -> None:
    findings = analyze(sorted(DEMO_APP.glob("*.py")), Config())
    counts = {confidence: 0 for confidence in Confidence}
    for finding in findings:
        counts[finding.confidence] += 1

    assert len(findings) == 11
    assert counts == {
        Confidence.DEFINITE: 1,
        Confidence.LIKELY: 7,
        Confidence.POSSIBLE: 3,
        Confidence.SAFE: 0,
    }


def test_demo_safe_examples_stay_quiet() -> None:
    assert analyze([DEMO_APP / "safe_examples.py"], Config()) == []
