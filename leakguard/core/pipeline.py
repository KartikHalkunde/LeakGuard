"""End-to-end parser -> CFG -> dataflow pipeline used by every surface."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

from leakguard.catalog.loader import Catalog, load_catalog

from .cfg import CFG, build_cfg, dotted
from .dataflow import analyze_cfg
from .escape import build_summaries
from .finding import Finding
from .parse import import_aliases, iter_functions


@dataclass
class _Module:
    path: Path
    source: str
    tree: ast.Module
    aliases: dict[str, str]


class _CatalogAdapter:
    def __init__(self, catalog: Catalog, aliases: dict[str, str], helpers: dict[str, str] | None = None,
                 safe_helpers: set[str] | None = None):
        self.catalog, self.aliases, self.helpers = catalog, aliases, helpers or {}
        self.safe_helpers = safe_helpers or set()

    def resolve(self, name: str | None) -> str | None:
        if not name:
            return None
        head, dot, tail = name.partition(".")
        return self.aliases.get(head, head) + (dot + tail if dot else "")

    def match_acquire(self, value: ast.AST | str | None) -> str | None:
        if isinstance(value, ast.Call):
            name = self.resolve(dotted(value.func))
        else:
            name = self.resolve(value) if isinstance(value, str) else None
        return self.helpers.get(name or "") or self.helpers.get((name or "").rsplit(".", 1)[-1]) or self.catalog.match_acquire(name)

    def is_release(self, resource: str, method: str) -> bool:
        return self.catalog.match_release(method, resource)

    def is_safe_call(self, callee: str) -> bool:
        return callee in self.safe_helpers or callee.rsplit(".", 1)[-1] in self.safe_helpers


def _params(function: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    args = function.args
    names = [a.arg for a in (*args.posonlyargs, *args.args, *args.kwonlyargs)]
    if args.vararg:
        names.append(args.vararg.arg)
    if args.kwarg:
        names.append(args.kwarg.arg)
    return names


def _qualname(function: ast.FunctionDef | ast.AsyncFunctionDef, tree: ast.Module) -> str:
    for parent in ast.walk(tree):
        if isinstance(parent, ast.ClassDef) and function in parent.body:
            return f"{parent.name}.{function.name}"
    return function.name


def _read_module(path: Path) -> _Module:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    return _Module(path, source, tree, import_aliases(tree))


def build_module_cfgs(module: _Module, catalog: Catalog, helpers: dict[str, str] | None = None,
                      safe_helpers: set[str] | None = None) -> tuple[dict[str, CFG], dict[str, list[str]]]:
    adapter = _CatalogAdapter(catalog, module.aliases, helpers, safe_helpers)
    cfgs: dict[str, CFG] = {}
    params: dict[str, list[str]] = {}
    for function in iter_functions(module.tree):
        name = _qualname(function, module.tree)
        cfg = build_cfg(function, str(module.path).replace("\\", "/"), adapter, module.source)
        cfg.func_name = name
        cfgs[name] = cfg
        params[name] = _params(function)
    return cfgs, params


def analyze_source(
    source: str, file: str = "<memory>", config=None, *, verify_fixes: bool = True
) -> list[Finding]:
    path = Path(file)
    module = _Module(path, source, ast.parse(source, filename=file), {})
    module.aliases = import_aliases(module.tree)
    catalog = load_catalog(getattr(config, "resources", None))
    initial, params = build_module_cfgs(module, catalog)
    initial_summaries = build_summaries(initial, params)
    helpers = {name: summary.returns_resource for name, summary in initial_summaries.items() if summary.returns_resource}
    safe_helpers = {name for name, summary in initial_summaries.items() if summary.closes_arg}
    cfgs, params = build_module_cfgs(module, catalog, helpers, safe_helpers)
    summaries = build_summaries(cfgs, params)
    findings = [finding for cfg in cfgs.values() for finding in analyze_cfg(cfg, summaries)]
    if verify_fixes:
        _resolve_fix_availability(findings, source, file, config)
    return findings


def _resolve_fix_availability(
    findings: list[Finding], source: str, file: str, config
) -> None:
    """Replace the guessed ``fix_available`` flag with a measured one.

    The dataflow pass can only guess, from confidence alone, whether a leak is
    fixable. That guess over-promises: a close nested inside a branch, or one
    reached only from an except handler, has no sound rewrite, yet the flag
    said otherwise. The editor then offered a fix that silently did nothing.

    Here we actually attempt the rewrite. ``verify_fixes=False`` on the nested
    call is what stops this recursing: verification analyses the patched
    source, which would otherwise try to verify its own fixes forever.
    """
    from leakguard.fix.rewrite import verified_patch

    def analyze(candidate: str) -> list[Finding]:
        return analyze_source(candidate, file, config, verify_fixes=False)

    for finding in findings:
        if finding.fix_available:
            finding.fix_available = verified_patch(finding, source, analyze) is not None


def run_pipeline(paths: list[Path], config) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        source = path.read_text(encoding="utf-8")
        findings.extend(analyze_source(source, str(path).replace("\\", "/"), config))
    return findings


def analyze_file(path: Path, config=None) -> list[Finding]:
    """Analyze one file while preserving SyntaxError as the CLI tool-error contract."""
    source = path.read_text(encoding="utf-8")
    return analyze_source(source, str(path).replace("\\", "/"), config)


def cfg_for_function(path: Path, function_name: str, config=None) -> tuple[CFG, list[Finding]]:
    module = _read_module(path)
    catalog = load_catalog(getattr(config, "resources", None))
    initial, params = build_module_cfgs(module, catalog)
    first = build_summaries(initial, params)
    helpers = {name: s.returns_resource for name, s in first.items() if s.returns_resource}
    safe_helpers = {name for name, summary in first.items() if summary.closes_arg}
    cfgs, params = build_module_cfgs(module, catalog, helpers, safe_helpers)
    if function_name not in cfgs:
        raise ValueError(f"function {function_name!r} not found in {path}")
    summaries = build_summaries(cfgs, params)
    cfg = cfgs[function_name]
    return cfg, analyze_cfg(cfg, summaries)
