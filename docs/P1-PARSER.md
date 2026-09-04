# P1 — Parser Engineer

**You own:** `leakguard/core/ir.py`, `leakguard/core/parse.py`, `leakguard/core/cfg.py`, `leakguard/report/mermaid.py`

**You are the critical path.** P2 cannot finish without your CFG. Ship the fixtures at hour 2 and keep the IR frozen.

> Note: `cli.py` belongs to **P3** — it's the CI contract surface. You own the engine frontend only.

---

## Hour 2 deliverable — hand-written fixtures (do this FIRST)

Before you write a single line of parser code, hand-build three `CFG` objects in `tests/fixtures/cfgs.py`. P2 develops against these for the next ten hours.

```python
# tests/fixtures/cfgs.py
from leakguard.core.ir import Acquire, Release, Escape, CallSite
from leakguard.core.cfg import CFG, BasicBlock, Edge

def simple_leak() -> CFG:
    """
    def f():
        conn = sqlite3.connect("db")   # 2
        return None                    # 3      <- leaks
    """
    return CFG(
        func_name="f", file="fixture.py",
        blocks={
            0: BasicBlock(0, [Acquire("conn", "sqlite3.Connection", 2, 4,
                                      'conn = sqlite3.connect("db")')], 2, 2),
            1: BasicBlock(1, [], 3, 3, kind="exit"),
        },
        edges=[Edge(0, 1, "return")],
        entry=0, exits=[1],
    )

def early_return_leak() -> CFG:
    """
    def f(x):
        conn = sqlite3.connect("db")   # 2
        if not x:                      # 3
            return None                # 4   <- leaks
        conn.close()                   # 5
        return True                    # 6   <- clean
    """
    return CFG(
        func_name="f", file="fixture.py",
        blocks={
            0: BasicBlock(0, [Acquire("conn", "sqlite3.Connection", 2, 4, "...")], 2, 3),
            1: BasicBlock(1, [], 4, 4, kind="exit"),          # return None
            2: BasicBlock(2, [Release("conn", 5)], 5, 5),
            3: BasicBlock(3, [], 6, 6, kind="exit"),          # return True
        },
        edges=[Edge(0, 1, "true"), Edge(0, 2, "false"), Edge(2, 3, "return")],
        entry=0, exits=[1, 3],
    )

def escaping_no_leak() -> CFG:
    """
    def get():
        conn = sqlite3.connect("db")   # 2
        return conn                    # 3   <- escapes, NOT a leak
    """
    return CFG(
        func_name="get", file="fixture.py",
        blocks={
            0: BasicBlock(0, [
                Acquire("conn", "sqlite3.Connection", 2, 4, "..."),
                Escape("conn", "return", 3),
            ], 2, 3),
            1: BasicBlock(1, [], 3, 3, kind="exit"),
        },
        edges=[Edge(0, 1, "return")],
        entry=0, exits=[1],
    )
```

Commit and tell P2. **This is your most time-critical task of the whole event.**

---

## Task 1 — `core/ir.py`

Frozen at hour 2. Do not change these after.

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Union

@dataclass(frozen=True)
class Acquire:
    var: str            # "conn"
    resource: str       # "sqlite3.Connection"
    line: int
    col: int
    snippet: str        # 'conn = sqlite3.connect("db")'

@dataclass(frozen=True)
class Release:
    var: str
    line: int

@dataclass(frozen=True)
class Escape:
    var: str
    kind: Literal["return", "attribute", "container",
                  "call_arg", "global", "yield", "closure"]
    line: int
    target: str | None = None      # callee or attribute name, for reporting

@dataclass(frozen=True)
class Scoped:
    """A `with` block — closed by construction."""
    var: str
    resource: str
    start_line: int
    end_line: int

@dataclass(frozen=True)
class Alias:
    src: str
    dst: str
    line: int

@dataclass(frozen=True)
class CallSite:
    callee: str
    args: tuple[str, ...]
    line: int
    may_raise: bool

Event = Union[Acquire, Release, Escape, Scoped, Alias, CallSite]
```

---

## Task 2 — `core/cfg.py` types

```python
from __future__ import annotations
from dataclasses import dataclass, field
from leakguard.core.ir import Event

@dataclass
class BasicBlock:
    id: int
    events: list[Event] = field(default_factory=list)
    line_start: int = 0
    line_end: int = 0
    kind: str = "normal"          # normal | entry | exit | exception_exit

@dataclass(frozen=True)
class Edge:
    src: int
    dst: int
    kind: str    # normal|true|false|loop_back|exception|return|break|continue

@dataclass
class CFG:
    func_name: str
    file: str
    blocks: dict[int, BasicBlock]
    edges: list[Edge]
    entry: int
    exits: list[int]

    def preds(self, b: int) -> list[int]:
        return [e.src for e in self.edges if e.dst == b]

    def succs(self, b: int) -> list[int]:
        return [e.dst for e in self.edges if e.src == b]

    def edge_kind(self, src: int, dst: int) -> str | None:
        for e in self.edges:
            if e.src == src and e.dst == dst:
                return e.kind
        return None
```

---

## Task 3 — `core/parse.py`

Thin. Ten minutes.

```python
import ast
from pathlib import Path

def parse_file(path: Path) -> ast.Module:
    src = path.read_text(encoding="utf-8")
    return ast.parse(src, filename=str(path))

def iter_functions(tree: ast.Module):
    """Yield every FunctionDef / AsyncFunctionDef, including nested and methods."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node
```

**Do not swallow `SyntaxError`.** Let it propagate — `cli.py` turns it into exit code 2 (tool error, warns but does not block CI).

---

## Task 4 — The CFG builder

This is your project. Build it incrementally; get each construct green in `tests/test_cfg.py` before starting the next.

### Builder skeleton

```python
import ast
from leakguard.core.ir import *
from leakguard.core.cfg import CFG, BasicBlock, Edge

SAFE_CALLS = {
    "len", "str", "int", "float", "bool", "isinstance", "print",
    "append", "get", "keys", "values", "items", "range", "enumerate",
}

class CFGBuilder:
    def __init__(self, func: ast.FunctionDef, file: str, catalog):
        self.func = func
        self.file = file
        self.catalog = catalog
        self.blocks: dict[int, BasicBlock] = {}
        self.edges: list[Edge] = []
        self._n = 0
        self.exits: list[int] = []
        self.loop_stack: list[tuple[int, int]] = []   # (header, after)
        self.handler_stack: list[int | None] = []     # innermost except entry
        self.tracked: set[str] = set()                # vars holding resources
        self.entry = self.new_block(kind="entry")
        self.cur = self.entry
        self.exception_exit = self.new_block(kind="exception_exit")
        self.exits.append(self.exception_exit)

    # ---- plumbing -------------------------------------------------
    def new_block(self, kind="normal") -> int:
        bid = self._n; self._n += 1
        self.blocks[bid] = BasicBlock(bid, kind=kind)
        return bid

    def edge(self, src: int, dst: int, kind="normal"):
        self.edges.append(Edge(src, dst, kind))

    def emit(self, ev: Event):
        self.blocks[self.cur].events.append(ev)

    def build(self) -> CFG:
        self.visit_body(self.func.body)
        # implicit `return None` at the end
        if self.cur is not None:
            end = self.new_block(kind="exit")
            self.edge(self.cur, end, "normal")
            self.exits.append(end)
        return CFG(self.func.name, self.file, self.blocks,
                   self.edges, self.entry, self.exits)
```

`self.cur = None` means **unreachable** — after a `return`, `break`, `continue`, or `raise`. Every visitor must check `if self.cur is None: return` at the top.

### Order of implementation

| # | Construct | Test first |
|---|---|---|
| 1 | straight-line statements | one block, events in order |
| 2 | `if` / `elif` / `else` | 4 blocks, join block has 2 preds |
| 3 | `return` | edge to a new exit block, `cur = None` |
| 4 | `while` / `for` | back-edge from body end to header |
| 5 | `break` / `continue` | edge to loop `after` / `header` |
| 6 | **`try`/`except`/`finally`** | exception edges present |
| 7 | `with` | emits `Scoped`, no internal close |
| 8 | aliasing | `Alias` event |

### `if` / `else`

```python
def visit_If(self, node: ast.If):
    if self.cur is None: return
    test_block = self.cur
    self.blocks[test_block].line_end = node.test.lineno

    then_b = self.new_block()
    else_b = self.new_block() if node.orelse else None
    after  = self.new_block()

    self.edge(test_block, then_b, "true")
    self.edge(test_block, else_b or after, "false")

    self.cur = then_b
    self.visit_body(node.body)
    if self.cur is not None:
        self.edge(self.cur, after, "normal")

    if else_b is not None:
        self.cur = else_b
        self.visit_body(node.orelse)
        if self.cur is not None:
            self.edge(self.cur, after, "normal")

    self.cur = after
```

### `return`

```python
def visit_Return(self, node: ast.Return):
    if self.cur is None: return
    if isinstance(node.value, ast.Name) and node.value.id in self.tracked:
        self.emit(Escape(node.value.id, "return", node.lineno))
    exit_b = self.new_block(kind="exit")
    self.edge(self.cur, exit_b, "return")
    self.exits.append(exit_b)
    self.cur = None                      # everything after is unreachable
```

### `while` / `for`

```python
def visit_While(self, node: ast.While):
    if self.cur is None: return
    header = self.new_block()
    body   = self.new_block()
    after  = self.new_block()

    self.edge(self.cur, header, "normal")
    self.edge(header, body, "true")
    self.edge(header, after, "false")

    self.loop_stack.append((header, after))
    self.cur = body
    self.visit_body(node.body)
    if self.cur is not None:
        self.edge(self.cur, header, "loop_back")
    self.loop_stack.pop()

    self.cur = after
```

`visit_For` is identical. `break` → `edge(cur, after)`, `cur = None`. `continue` → `edge(cur, header, "loop_back")`, `cur = None`.

> **Known limitation to document:** a resource opened inside a loop body and closed after the loop leaks on every iteration but the last. The back-edge makes the state `MAYBE_OPEN` at the header, so P2 flags it as `LIKELY`. That's the correct outcome — note it in the decision log.

### 🔥 `try` / `except` / `finally` — the hard one

**Core rule: every `CallSite` with `may_raise=True` terminates its basic block** and gets two successors — a `normal` edge to the next block, and an `exception` edge to the innermost handler (or to `exception_exit` if there is none).

```python
def visit_Try(self, node: ast.Try):
    if self.cur is None: return

    body_b    = self.new_block()
    handler_b = self.new_block() if node.handlers else None
    final_b   = self.new_block() if node.finalbody else None
    after     = self.new_block()

    self.edge(self.cur, body_b, "normal")

    # calls inside the body route their exception edge here
    self.handler_stack.append(handler_b or final_b or self.exception_exit)
    self.cur = body_b
    self.visit_body(node.body)
    self.handler_stack.pop()

    if self.cur is not None:
        if node.orelse:
            self.visit_body(node.orelse)
        self.edge(self.cur, final_b or after, "normal")

    if handler_b is not None:
        self.cur = handler_b
        for h in node.handlers:
            self.visit_body(h.body)
        if self.cur is not None:
            self.edge(self.cur, final_b or after, "normal")

    if final_b is not None:
        self.cur = final_b
        self.visit_body(node.finalbody)
        if self.cur is not None:
            self.edge(self.cur, after, "normal")

    self.cur = after
```

And in the call handler:

```python
def record_call(self, callee: str, args: tuple[str, ...], line: int):
    may_raise = callee.split(".")[-1] not in SAFE_CALLS
    self.emit(CallSite(callee, args, line, may_raise))
    if may_raise:
        target = self.handler_stack[-1] if self.handler_stack else self.exception_exit
        nxt = self.new_block()
        self.edge(self.cur, target, "exception")
        self.edge(self.cur, nxt, "normal")
        self.cur = nxt
```

**Why `SAFE_CALLS` matters:** without it, every call splits a block and adds an exception edge, and the analysis drowns. Keep the list conservative but real.

**Tell P2 explicitly:** a leak reachable *only* via an `exception` edge must be capped at `LIKELY`, never `DEFINITE`. That single rule is what stops the tool flagging every `try` block — the exact failure the problem statement warns about.

### `with`

```python
def visit_With(self, node: ast.With):
    if self.cur is None: return
    end_line = max(getattr(s, "end_lineno", s.lineno) for s in node.body)
    for item in node.items:
        res = self.catalog.match_acquire(item.context_expr)
        if res and isinstance(item.optional_vars, ast.Name):
            var = item.optional_vars.id
            self.tracked.add(var)
            self.emit(Scoped(var, res, node.lineno, end_line))
    self.visit_body(node.body)
```

**Do not model the internal close.** `Scoped` tells P2 "closed by construction." This one method eliminates your single biggest false-positive class.

Handle `contextlib.closing(...)` and `ExitStack().enter_context(...)` the same way.

---

## Task 5 — Event extraction

Inside `visit_Assign` / `visit_Expr`:

| Pattern | Emit |
|---|---|
| `x = sqlite3.connect(...)` where callee ∈ catalog acquire | `Acquire`; add `x` to `self.tracked` |
| `x.close()` where `x` ∈ tracked and `close` ∈ catalog release | `Release` |
| `b = a` where `a` ∈ tracked | `Alias`; add `b` to tracked |
| `return x` where `x` ∈ tracked | `Escape(kind="return")` |
| `self.x = c` / `obj.attr = c`, `c` ∈ tracked | `Escape(kind="attribute")` |
| `lst.append(c)`, `d[k] = c`, `s.add(c)` | `Escape(kind="container")` |
| `foo(c)` where `foo` is not a release | `Escape(kind="call_arg", target="foo")` |
| `yield c` | `Escape(kind="yield")` |
| any call | `CallSite` |

Resolve dotted names with a helper:

```python
def dotted(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):      return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f"{base}.{node.attr}" if base else None
    return None
```

Resolve `import sqlite3` / `from sqlite3 import connect` into a module alias map at file level so `connect(...)` matches `sqlite3.connect`.

---

## Task 6 — `report/mermaid.py` (Phase 3)

**Protect this task.** It's the best visual in the project and no competing team can produce it.

```python
def to_mermaid(cfg: CFG, leak_path: list[int]) -> str:
    lines = ["graph TD"]
    for bid, b in cfg.blocks.items():
        label = f"L{b.line_start}-{b.line_end}" if b.line_end > b.line_start \
                else f"L{b.line_start}"
        summary = summarize(b.events)          # "conn = connect(...)" etc.
        lines.append(f'    B{bid}["{label}: {summary}"]')
    for e in cfg.edges:
        arrow = f"-->|{e.kind}|" if e.kind not in ("normal",) else "-->"
        lines.append(f"    B{e.src} {arrow} B{e.dst}")
    for bid in leak_path:
        lines.append(f"    style B{bid} fill:#ff6b6b,stroke:#c92a2a")
    return "\n".join(lines)
```

P2 gives you `leak_path` on the `Finding`. Wire it to `leakguard explain FILE:FUNC`.

---

## Your test file — `tests/test_cfg.py`

Write these as you go, not at the end.

```python
def test_if_creates_join_block():
    cfg = build("def f(x):\n  if x:\n    a=1\n  else:\n    a=2\n  return a")
    join = [b for b in cfg.blocks if len(cfg.preds(b)) == 2]
    assert len(join) == 1

def test_return_terminates_block():
    cfg = build("def f():\n  return 1\n  x = 2")
    assert not any(isinstance(e, Acquire) for b in cfg.blocks.values()
                   for e in b.events)   # x=2 unreachable

def test_try_has_exception_edge():
    cfg = build("def f():\n  try:\n    risky()\n  except:\n    pass")
    assert any(e.kind == "exception" for e in cfg.edges)

def test_with_emits_scoped():
    cfg = build("def f(p):\n  with open(p) as fh:\n    return fh.read()")
    assert any(isinstance(e, Scoped) for b in cfg.blocks.values() for e in b.events)

def test_loop_has_back_edge():
    cfg = build("def f(xs):\n  for x in xs:\n    g(x)")
    assert any(e.kind == "loop_back" for e in cfg.edges)
```

---

## Your schedule

| Hours | Task |
|---|---|
| 0–2 | Contracts with the team. Commit `ir.py` + `cfg.py` types. |
| 2–4 | **Fixtures for P2** · `parse.py` · builder skeleton |
| 4–6 | Straight-line blocks, event extraction |
| 6–8 | `if` / `elif` / `else` + join blocks |
| 8–11 | Loops, `break`, `continue`, back-edges |
| 11–14 | **`try`/`except`/`finally` + exception edges** |
| 14–16 | `with` → `Scoped` · aliasing · `contextlib.closing` |
| 16–18 | 🔗 Integrate with P2. Run the corpus. Fix what breaks. |
| 18–21 | Harden against corpus failures |
| 21–24 | `report/mermaid.py` |
| 24–26 | Bug-fixing |
| 26–30 | Freeze · your section of `docs/01-architecture.md` · rehearse |

---

## Read before hour 0

- Python [`ast`](https://docs.python.org/3/library/ast.html) module — especially `ast.walk`, `ast.NodeVisitor`, `lineno`/`end_lineno`
- What a basic block is (any compilers primer, 10 minutes)
- CFG construction for `try`/`finally` — the one part worth reading twice

**Demo segment you own:** the live catch of the early return + exception path. You'll be asked *how* it works. Be ready to draw the CFG on a whiteboard.
