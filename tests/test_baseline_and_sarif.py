"""Baseline ratchet, SARIF shape, fingerprints and the catalogue - P3."""

from __future__ import annotations

import json

from leakguard.baseline.store import Baseline
from leakguard.catalog.loader import load_catalog
from leakguard.core.finding import Confidence, Finding, PathStep
from leakguard.report import sarif


def make(var="conn", snippet="conn = sqlite3.connect('db')", conf=Confidence.DEFINITE):
    return Finding(
        confidence=conf,
        resource="sqlite3.Connection",
        file="app/db.py",
        function="fetch",
        variable=var,
        acquired_line=12,
        acquired_col=4,
        snippet=snippet,
        leak_path=[PathStep(12, "conn opened here"), PathStep(15, "return")],
        close_found_at=[22],
        close_unreachable_from=15,
        reason="reaches function exit with conn still open",
    )


# -- fingerprints ----------------------------------------------------------


def test_fingerprint_is_stable():
    assert make().fingerprint == make().fingerprint


def test_fingerprint_ignores_whitespace_and_literals():
    """Must survive `black` and a changed connection string."""
    a = make(snippet="conn = sqlite3.connect('db')")
    b = make(snippet="conn   =  sqlite3.connect('other.db')")
    assert a.fingerprint == b.fingerprint


def test_fingerprint_ignores_line_moves():
    a, b = make(), make()
    b.acquired_line = 99
    assert a.fingerprint == b.fingerprint


def test_ordinal_disambiguates():
    a, b = make(), make()
    b.ordinal = 1
    assert a.fingerprint != b.fingerprint


# -- baseline ratchet ------------------------------------------------------


def test_snapshot_then_filter_is_green(tmp_path):
    findings = [make()]
    path = tmp_path / "baseline.json"

    b = Baseline(path)
    assert b.snapshot(findings) == 1

    fresh = Baseline(path).load()
    assert fresh.source == "local"
    assert fresh.filter(findings) == []


def test_new_finding_still_reported(tmp_path):
    path = tmp_path / "baseline.json"
    Baseline(path).snapshot([make()])

    new = make(var="fh", snippet="fh = open(p)")
    assert Baseline(path).load().filter([make(), new]) == [new]


def test_missing_baseline_is_not_an_error(tmp_path):
    b = Baseline(tmp_path / "nope.json").load()
    assert b.source == "none"
    assert b.filter([make()]) == [make()]


def test_unreachable_control_plane_falls_back_to_local(tmp_path):
    path = tmp_path / "baseline.json"
    Baseline(path).snapshot([make()])
    # Port 9 is discard; the fetch fails fast and must fall through.
    b = Baseline(path, remote_url="http://127.0.0.1:9").load()
    assert b.source == "local"
    assert b.filter([make()]) == []


def test_corrupt_baseline_does_not_crash(tmp_path):
    path = tmp_path / "baseline.json"
    path.write_text("{ not json", encoding="utf-8")
    assert Baseline(path).load().filter([make()]) == [make()]


# -- SARIF -----------------------------------------------------------------


def test_sarif_levels_map_correctly():
    doc = sarif.build([make(conf=Confidence.DEFINITE), make(conf=Confidence.LIKELY)])
    levels = [r["level"] for r in doc["runs"][0]["results"]]
    assert levels == ["error", "warning"]


def test_sarif_carries_witness_path_as_codeflow():
    doc = sarif.build([make()])
    flow = doc["runs"][0]["results"][0]["codeFlows"][0]["threadFlows"][0]["locations"]
    assert [f["location"]["physicalLocation"]["region"]["startLine"] for f in flow] == [12, 15]


def test_sarif_has_partial_fingerprint():
    doc = sarif.build([make()])
    fps = doc["runs"][0]["results"][0]["partialFingerprints"]
    assert fps["leakguardFingerprint/v1"] == make().fingerprint


def test_sarif_dedupes_rules():
    doc = sarif.build([make(), make(var="c2")])
    assert len(doc["runs"][0]["tool"]["driver"]["rules"]) == 1
    assert len(doc["runs"][0]["results"]) == 2


def test_sarif_empty_is_valid():
    doc = sarif.build([])
    assert doc["runs"][0]["results"] == []
    json.dumps(doc)


def test_sarif_rule_index_matches():
    doc = sarif.build([make()])
    run = doc["runs"][0]
    idx = run["results"][0]["ruleIndex"]
    assert run["tool"]["driver"]["rules"][idx]["id"] == run["results"][0]["ruleId"]


# -- catalogue -------------------------------------------------------------


def test_catalog_matches_fully_qualified():
    assert load_catalog().match_acquire("sqlite3.connect") == "sqlite3.Connection"


def test_catalog_matches_bare_import():
    """`from sqlite3 import connect` then `connect(...)`."""
    assert load_catalog().match_acquire("connect") is not None


def test_catalog_ignores_unknown():
    assert load_catalog().match_acquire("random.choice") is None


def test_catalog_is_user_extensible():
    cat = load_catalog([{"id": "myorg.Pool", "acquire": ["myorg.pool.acquire"]}])
    assert cat.match_acquire("myorg.pool.acquire") == "myorg.Pool"


def test_catalog_release_lookup():
    assert load_catalog().match_release("close", "sqlite3.Connection")
    assert not load_catalog().match_release("frobnicate", "sqlite3.Connection")
