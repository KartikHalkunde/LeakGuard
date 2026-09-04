from __future__ import annotations

import ast
from pathlib import Path
from typing import Iterator


def parse_file(path: Path) -> ast.Module:
    """Parse *path*, deliberately allowing ``SyntaxError`` to propagate."""

    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def iter_functions(tree: ast.Module) -> Iterator[ast.FunctionDef | ast.AsyncFunctionDef]:
    """Yield all functions, including async functions, methods, and nested functions."""

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def import_aliases(tree: ast.Module) -> dict[str, str]:
    """Return local import names mapped to their fully-qualified names."""

    aliases: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Import):
            for name in node.names:
                aliases[name.asname or name.name.split(".")[0]] = name.name
        elif isinstance(node, ast.ImportFrom) and node.module:
            for name in node.names:
                if name.name != "*":
                    aliases[name.asname or name.name] = f"{node.module}.{name.name}"
    return aliases

