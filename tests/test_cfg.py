import ast

from leakguard.core.cfg import DefaultCatalog, build_cfg
from leakguard.core.ir import Acquire, Alias, Escape, Release, Scoped


def build(source: str):
    tree = ast.parse(source)
    return build_cfg(tree.body[0], "test.py", DefaultCatalog(), source)


def events(cfg): return [event for block in cfg.blocks.values() for event in block.events]


def test_if_creates_join_block():
    cfg = build("def f(x):\n  if x:\n    a=1\n  else:\n    a=2\n  return a")
    assert len([b for b in cfg.blocks if len(cfg.preds(b)) == 2]) == 1


def test_return_terminates_block():
    cfg = build("def f():\n  return 1\n  x = open('x')")
    assert not any(isinstance(event, Acquire) for event in events(cfg))


def test_try_has_exception_edge():
    assert any(e.kind == "exception" for e in build("def f():\n  try:\n    risky()\n  except:\n    pass").edges)


def test_with_emits_scoped():
    assert any(isinstance(e, Scoped) for e in events(build("def f(p):\n  with open(p) as fh:\n    return fh.read()")))


def test_loop_has_back_edge():
    assert any(e.kind == "loop_back" for e in build("def f(xs):\n  for x in xs:\n    g(x)").edges)


def test_extracts_acquire_release_alias_and_escapes():
    cfg = build("def f(p, out):\n  a = open(p)\n  b = a\n  out.append(b)\n  b.close()")
    kinds = tuple(type(e) for e in events(cfg))
    assert Acquire in kinds and Alias in kinds and Escape in kinds and Release in kinds


def test_break_and_continue_edges():
    cfg = build("def f(xs):\n  for x in xs:\n    if x:\n      continue\n    break")
    assert {"break", "continue"} <= {edge.kind for edge in cfg.edges}


def test_returned_acquisition_escapes():
    ev = events(build("def f(p):\n  return open(p)"))
    assert any(isinstance(e, Acquire) for e in ev) and any(isinstance(e, Escape) and e.kind == "return" for e in ev)


def test_direct_attribute_and_container_acquisitions_escape():
    cfg = build("def f(p, out):\n  self.handle = open(p)\n  out.append(open(p))")
    escaped = [e for e in events(cfg) if isinstance(e, Escape)]
    assert {e.kind for e in escaped} >= {"attribute", "container"}
