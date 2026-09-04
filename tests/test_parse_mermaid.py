import ast

from leakguard.core.cfg import DefaultCatalog, build_cfg
from leakguard.core.parse import import_aliases, iter_functions
from leakguard.report.mermaid import to_mermaid


def test_functions_and_import_alias_resolution():
    tree = ast.parse("from sqlite3 import connect as db_connect\nclass C:\n def m(self):\n  async def nested(): pass\n")
    assert [fn.name for fn in iter_functions(tree)] == ["m", "nested"]
    assert import_aliases(tree)["db_connect"] == "sqlite3.connect"


def test_mermaid_renders_edges_and_highlight():
    src = "def f(p):\n f = open(p)\n return None"
    cfg = build_cfg(ast.parse(src).body[0], "x.py", DefaultCatalog(), src)
    output = to_mermaid(cfg, [cfg.entry])
    assert output.startswith("graph TD") and "style B0" in output and "exception" in output

