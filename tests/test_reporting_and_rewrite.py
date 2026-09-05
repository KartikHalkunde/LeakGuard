from __future__ import annotations

import json

from leakguard.core.dataflow import analyze_cfg
from leakguard.core.finding import Confidence, Finding
from leakguard.fix.rewrite import make_patch, verified_patch
from leakguard.report.json import build_report, render as render_json
from leakguard.report.text import render as render_text
from tests.fixtures.cfgs import simple_leak


def test_fingerprint_ignores_whitespace_and_string_contents() -> None:
    common = dict(confidence=Confidence.DEFINITE, resource="builtins.file", file="a.py", function="f", variable="f", acquired_line=2, acquired_col=0)
    left = Finding(**common, snippet='f = open("one")')
    right = Finding(**common, snippet="f =   open('two')")
    assert left.fingerprint == right.fingerprint


def test_json_report_is_canonical_and_serializable() -> None:
    findings = analyze_cfg(simple_leak())
    report = build_report(findings, files_scanned=1, duration_ms=4)
    assert report["version"] == "1.0"
    assert report["summary"]["definite"] == 1
    assert json.loads(render_json(findings))["findings"][0]["fingerprint"] == findings[0].fingerprint


def test_text_report_respects_no_colour_request() -> None:
    output = render_text(analyze_cfg(simple_leak()), colour=False)
    assert "LEAK (definite)" in output and "\033" not in output


def test_with_rewrite_and_verification() -> None:
    source = "f = open(path)\ndata = f.read()\nf.close()\n"
    finding = Finding(Confidence.DEFINITE, "builtins.file", "x.py", "f", "f", 1, 0, "f = open(path)", close_found_at=[3])
    patched = make_patch(finding, source)
    assert patched == "with open(path) as f:\n    data = f.read()\n"
    assert verified_patch(finding, source, lambda _: []) == patched
    assert verified_patch(finding, source, lambda _: [finding]) is None


def test_with_rewrite_preserves_relative_function_indentation() -> None:
    source = "def read(path, bad):\n    f = open(path)\n    if bad:\n        return\n    f.close()\n"
    finding = Finding(Confidence.LIKELY, "builtins.file", "x.py", "read", "f", 2, 4, "f = open(path)", close_found_at=[5])
    assert make_patch(finding, source) == (
        "def read(path, bad):\n    with open(path) as f:\n        if bad:\n            return\n"
    )


def test_try_finally_rewrite_for_non_file_resources() -> None:
    source = "conn = sqlite3.connect(db)\nrow = conn.execute(query)\nconn.close()\n"
    finding = Finding(Confidence.LIKELY, "sqlite3.Connection", "x.py", "query", "conn", 1, 0, "conn = sqlite3.connect(db)", close_found_at=[3])
    assert make_patch(finding, source) == (
        "conn = sqlite3.connect(db)\ntry:\n    row = conn.execute(query)\nfinally:\n    conn.close()\n"
    )


def test_fixture_findings_file_has_five_real_shaped_entries() -> None:
    with open("tests/fixtures/findings.json", encoding="utf-8") as fixture:
        payload = json.load(fixture)
    assert payload["version"] == "1.0" and len(payload["findings"]) == 5


def test_apply_fixes_resolves_every_fixable_leak_in_one_file(tmp_path):
    """One call must fix every fixable leak in a file, not just the first.

    Findings carry line numbers from the source they were produced against, so
    the moment one patch lands the rest describe a file that no longer exists:
    their lines have shifted and the rewrite silently fails to match. Without
    re-deriving findings between rounds the later leaks are left behind.
    """
    from leakguard import analyze
    from leakguard.fix.rewrite import apply_fixes

    def leaky(name: str, var: str) -> str:
        return (
            f"def {name}(path, bad):\n"
            f"    {var} = open(path)\n"
            f"    if bad:\n"
            f"        return None\n"
            f"    {var}.close()\n"
            f"    return 'ok'\n"
        )

    source = tmp_path / "many.py"
    source.write_text("\n\n".join(leaky(n, v) for n, v in
                                 [("first", "f"), ("second", "g"), ("third", "h")]),
                      encoding="utf-8")

    before = analyze([source], None)
    assert len(before) == 3, f"fixture should leak three times, got {len(before)}"

    apply_fixes(before, write=True)

    after = analyze([source], None)
    assert after == [], f"expected every leak fixed, {len(after)} remain"
