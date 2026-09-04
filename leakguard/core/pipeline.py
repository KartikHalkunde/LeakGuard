"""File-level orchestration — the seam between parsing and analysis.

This is the glue that sits between P1's frontend (parse -> CFG) and P2's
analysis (`analyze_cfg`, one CFG at a time). It walks files, builds a CFG per
function, computes interprocedural summaries across the module, and collects
findings.

`engine.analyze()` imports `run_pipeline` from here. The moment this module
exists the stub path in engine.py switches off automatically, so nothing else
in the codebase needs editing.

Design notes:

* Summaries are built per module, not per function, because `build_summaries`
  needs every CFG in the file to answer "does this helper return a resource?"
  and "does this helper close its argument?". Getting that wrong is the main
  source of false positives on the `get_conn()` / `cleanup(c)` patterns.

* A file that fails to parse is reported as a tool-level note rather than
  raised. One unparseable file must not abort a whole-repo scan, and it must
  not fail a build either - the CLI treats findings and tool errors
  differently on purpose.
"""

from __future__ import annotations

import ast
from pathlib import Path

from leakguard.core.cfg import CFG, DefaultCatalog, build_cfg
from leakguard.core.dataflow import analyze_cfg
from leakguard.core.escape import build_summaries
from leakguard.core.finding import Confidence, Finding
from leakguard.core.parse import import_aliases, iter_functions, parse_file


def _qualname(node: ast.FunctionDef | ast.AsyncFunctionDef, tree: ast.Module) -> str:
    """Qualified name so two same-named methods in one file stay distinct.

    `build_summaries` is keyed by function name, and a module with
    `A.close` and `B.close` would otherwise collapse into one summary and
    leak facts across unrelated classes.
    """
    for parent in ast.walk(tree):
        if isinstance(parent, ast.ClassDef):
            for child in parent.body:
                if child is node:
                    return f"{parent.name}.{node.name}"
    return node.name


def _params(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    a = node.args
    names = [p.arg for p in (*a.posonlyargs, *a.args, *a.kwonlyargs)]
    if a.vararg:
        names.append(a.vararg.arg)
    if a.kwarg:
        names.append(a.kwarg.arg)
    return names


def analyze_file(path: Path) -> list[Finding]:
    """Analyze a single Python file and return its findings."""
    rel = str(path).replace("\\", "/")

    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return [_tool_note(rel, f"could not read file: {exc}")]

    try:
        tree = parse_file(path)
    except SyntaxError as exc:
        return [_tool_note(rel, f"syntax error at line {exc.lineno}: {exc.msg}")]

    catalog = DefaultCatalog(import_aliases(tree))

    cfgs: dict[str, CFG] = {}
    params: dict[str, list[str]] = {}
    for func in iter_functions(tree):
        name = _qualname(func, tree)
        try:
            cfgs[name] = build_cfg(func, rel, catalog, source)
        except RecursionError:
            # Pathologically nested function: skip it rather than lose the file.
            continue
        params[name] = _params(func)

    if not cfgs:
        return []

    summaries = build_summaries(cfgs, params)

    findings: list[Finding] = []
    for cfg in cfgs.values():
        findings.extend(analyze_cfg(cfg, summaries))
    return findings


def _tool_note(file: str, reason: str) -> Finding:
    """A tool-level problem, surfaced as POSSIBLE so it never blocks a build."""
    return Finding(
        confidence=Confidence.POSSIBLE,
        resource="<analysis>",
        file=file,
        function="<module>",
        variable="<file>",
        acquired_line=0,
        reason=reason,
        severity="info",
    )


def run_pipeline(paths: list[Path], config=None) -> list[Finding]:
    """Analyze every given file. The entrypoint `engine.analyze()` calls."""
    findings: list[Finding] = []
    for path in paths:
        findings.extend(analyze_file(Path(path)))
    return findings
