from __future__ import annotations

from leakguard.core.confidence import score
from leakguard.core.dataflow import State, analyze_cfg, bfs_path, join, solve
from leakguard.core.escape import Summary, build_summaries
from leakguard.core.finding import Confidence
from leakguard.core.ir import CallSite, Release
from tests.fixtures.cfgs import early_return_leak, escaping_no_leak, simple_leak


def test_simple_leak_is_definite() -> None:
    finding = analyze_cfg(simple_leak())[0]
    assert finding.confidence is Confidence.DEFINITE
    assert finding.variable == "conn"


def test_early_return_is_likely_with_witness() -> None:
    finding = analyze_cfg(early_return_leak())[0]
    assert finding.confidence is Confidence.LIKELY
    assert [step.line for step in finding.leak_path] == [2, 3, 4]
    assert finding.block_path == [0, 1]


def test_escape_suppresses_a_finding() -> None:
    assert analyze_cfg(escaping_no_leak()) == []


def test_join_is_monotone_and_escape_dominates() -> None:
    assert join(State.OPEN, State.CLOSED) is State.MAYBE_OPEN
    assert join(State.ESCAPED, State.CLOSED) is State.ESCAPED


def test_solver_reaches_empty_entry_successor() -> None:
    outgoing = solve(simple_leak())
    assert outgoing[1]["conn"] is State.OPEN


def test_bfs_returns_a_counterexample_path() -> None:
    assert bfs_path(early_return_leak(), 0, 3) == [0, 2, 3]


def test_interprocedural_close_summary_updates_callsite() -> None:
    cfg = simple_leak()
    cfg.blocks[0].events.append(CallSite("cleanup", ("conn",), 3, False))
    assert analyze_cfg(cfg, {"cleanup": Summary(closes_arg=frozenset({0}))}) == []


def test_summary_builder_records_return_and_parameter_close() -> None:
    cleanup = simple_leak()
    cleanup.blocks[0].events.append(Release("conn", 3))
    result = build_summaries({"get": escaping_no_leak(), "cleanup": cleanup}, {"cleanup": ["conn"]})
    assert result["get"].returns_resource == "sqlite3.Connection"
    assert result["cleanup"].closes_arg == frozenset({0})


def test_exception_only_candidate_never_becomes_definite() -> None:
    assert score([{"exit": 1, "exit_kind": "exception"}], [1]) is Confidence.LIKELY
