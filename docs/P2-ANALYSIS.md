# P2 — Analysis Engineer

**You own:** `leakguard/core/finding.py`, `core/dataflow.py`, `core/escape.py`, `core/confidence.py`, `fix/rewrite.py`, `report/text.py`, `report/json.py`

**You own correctness and the false-positive rate — half the grade.**

> **Hard rule: `dataflow.py` must never `import ast`.** It works only on P1's IR and CFG types. That's what lets you develop against fixtures for ten hours while P1's parser is half-built.

---

## Hour 2 deliverable — JSON fixtures for P3 and P4

Dump five `Finding` objects to `tests/fixtures/findings.json` so P3 can build SARIF and n8n, and P4 can build the dashboard, against real-shaped data. Half an hour, unblocks two people.

---

## Task 1 — `core/finding.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from enum import Enum
import hashlib, re

class Confidence(str, Enum):
    DEFINITE = "definite"
    LIKELY   = "likely"
    POSSIBLE = "possible"
    SAFE     = "safe"

ORDER = {Confidence.DEFINITE: 3, Confidence.LIKELY: 2,
         Confidence.POSSIBLE: 1, Confidence.SAFE: 0}

@dataclass
class PathStep:
    line: int
    note: str

@dataclass
class Finding:
    confidence: Confidence
    resource: str
    file: str
    function: str
    variable: str
    acquired_line: int
    acquired_col: int
    snippet: str
    leak_path: list[PathStep] = field(default_factory=list)
    close_found_at: list[int] = field(default_factory=list)
    close_unreachable_from: int | None = None
    exit_kind: str = "return"          # return | fallthrough | exception
    reason: str = ""
    fix_available: bool = False
    severity: str = "medium"
    ordinal: int = 0
    escape_kind: str | None = None
    block_path: list[int] = field(default_factory=list)   # for P1's Mermaid

    @property
    def fingerprint(self) -> str:
        norm = re.sub(r"\s+", " ", self.snippet).strip()
        norm = re.sub(r"'[^']*'|\"[^\"]*\"", "STR", norm)
        key = f"{self.file}:{self.function}:{self.resource}:{norm}:{self.ordinal}"
        return hashlib.sha256(key.encode()).hexdigest()[:16]
```

**Fingerprints must not contain line numbers.** A line-based fingerprint breaks the moment someone runs `black`, and the baseline ratchet dies with it. `ordinal` disambiguates two identical acquisitions in one function.

---

## Task 2 — `core/dataflow.py`

### The lattice

```python
from enum import Enum

class State(Enum):
    OPEN       = "open"
    CLOSED     = "closed"
    MAYBE_OPEN = "maybe_open"
    ESCAPED    = "escaped"

def join(a: State | None, b: State | None) -> State:
    if a is None: return b
    if b is None: return a
    if a is State.ESCAPED or b is State.ESCAPED:
        return State.ESCAPED                    # escape dominates
    if a == b:
        return a
    return State.MAYBE_OPEN

def join_all(states: list[dict[str, State]]) -> dict[str, State]:
    out: dict[str, State] = {}
    for s in states:
        for var, st in s.items():
            out[var] = join(out.get(var), st)
    return out
```

| ⊔ | OPEN | CLOSED | MAYBE_OPEN | ESCAPED |
|---|---|---|---|---|
| **OPEN** | OPEN | MAYBE_OPEN | MAYBE_OPEN | ESCAPED |
| **CLOSED** | MAYBE_OPEN | CLOSED | MAYBE_OPEN | ESCAPED |
| **MAYBE_OPEN** | MAYBE_OPEN | MAYBE_OPEN | MAYBE_OPEN | ESCAPED |
| **ESCAPED** | ESCAPED | ESCAPED | ESCAPED | ESCAPED |

**ESCAPED dominates deliberately.** If a resource escapes on *any* path, stop reasoning about it. Conservatism in favour of silence — this is the choice that keeps the tool installed.

### Transfer function

```python
from leakguard.core.ir import Acquire, Release, Escape, Scoped, Alias, CallSite

def transfer(state: dict[str, State], ev, summaries) -> dict[str, State]:
    s = dict(state)
    match ev:
        case Acquire(var=v):
            s[v] = State.OPEN
        case Release(var=v):
            s[v] = State.CLOSED
        case Escape(var=v):
            s[v] = State.ESCAPED
        case Scoped(var=v):
            s[v] = State.CLOSED                 # closed by construction
        case Alias(src=a, dst=b):
            if a in s: s[b] = s[a]
        case CallSite(callee=c, args=args):
            # interprocedural summaries — see Task 3
            if c in summaries:
                for idx in summaries[c].closes_arg:
                    if idx < len(args) and args[idx] in s:
                        s[args[idx]] = State.CLOSED
    return s
```

### The fixpoint

```python
from collections import deque

MAX_BLOCKS = 500

def solve(cfg, summaries) -> dict[int, dict[str, State]]:
    if len(cfg.blocks) > MAX_BLOCKS:
        raise TooComplex(cfg.func_name)

    IN  = {b: {} for b in cfg.blocks}
    OUT = {b: {} for b in cfg.blocks}
    work = deque([cfg.entry])

    while work:
        b = work.popleft()
        preds = cfg.preds(b)
        IN[b] = join_all([OUT[p] for p in preds]) if preds else {}

        st = dict(IN[b])
        for ev in cfg.blocks[b].events:
            st = transfer(st, ev, summaries)

        if st != OUT[b]:
            OUT[b] = st
            work.extend(cfg.succs(b))

    return OUT
```

Termination is guaranteed: the lattice has height 4 and `join` is monotonic.

**`TooComplex` handling:** catch it in `analyze()`, emit a single `POSSIBLE` finding noting the function was skipped, and move on. Never hang CI.

### Exit check — where the leak is caught

```python
def check_exits(cfg, OUT, acquisitions: dict[str, Acquire]):
    """acquisitions: var -> the Acquire event that created it"""
    candidates = []
    for exit_b in cfg.exits:
        kind = "exception" if cfg.blocks[exit_b].kind == "exception_exit" else \
               (cfg.edge_kind(cfg.preds(exit_b)[0], exit_b) if cfg.preds(exit_b) else "fallthrough")
        for var, st in OUT[exit_b].items():
            if st in (State.OPEN, State.MAYBE_OPEN) and var in acquisitions:
                candidates.append({
                    "var": var, "exit": exit_b, "state": st, "exit_kind": kind,
                    "path": bfs_path(cfg, acquire_block(cfg, var), exit_b),
                })
    return candidates
```

### Witness path — BFS

This is what makes the report credible. Don't skip it.

```python
from collections import deque

def bfs_path(cfg, src: int, dst: int) -> list[int]:
    prev = {src: None}
    q = deque([src])
    while q:
        b = q.popleft()
        if b == dst:
            path, cur = [], b
            while cur is not None:
                path.append(cur); cur = prev[cur]
            return list(reversed(path))
        for s in cfg.succs(b):
            if s not in prev:
                prev[s] = b
                q.append(s)
    return []
```

Turn the block path into `PathStep`s with human notes:

```
line 2   conn opened here
line 3   branch taken
line 4   return — exits with conn still open
```

---

## Task 3 — `core/escape.py` (interprocedural summaries)

P1 emits `Escape` events from syntax. **You** add the cross-function pass. One module-level scan, two facts per function:

```python
@dataclass
class Summary:
    returns_resource: str | None    # resource id, if the function returns one
    closes_arg: set[int]            # parameter indices it closes

def build_summaries(module_cfgs: dict[str, CFG]) -> dict[str, Summary]:
    out = {}
    for name, cfg in module_cfgs.items():
        returns = None
        closes  = set()
        params  = param_names(cfg)
        for b in cfg.blocks.values():
            for ev in b.events:
                if isinstance(ev, Escape) and ev.kind == "return":
                    returns = resource_of(cfg, ev.var)
                if isinstance(ev, Release) and ev.var in params:
                    closes.add(params.index(ev.var))
        out[name] = Summary(returns, closes)
    return out
```

Then in `transfer`:
- `c = get_conn()` where `summaries["get_conn"].returns_resource` → treat as `Acquire`
- `cleanup(c)` where `0 in summaries["cleanup"].closes_arg` → treat as `Release`

This kills the two most common real-world false positives:

```python
def get_conn():  return sqlite3.connect(db)   # returns_resource
def cleanup(c):  c.close()                    # closes_arg = {0}

def work():
    c = get_conn()      # ← Acquire
    cleanup(c)          # ← Release  → no finding
```

**If a callee cannot be resolved, do nothing** — P1 already emitted `Escape(kind="call_arg")`, which downgrades to `POSSIBLE`. Never guess.

**Single-module only.** Document that in `docs/04-limitations.md`.

---

## Task 4 — `core/confidence.py`

```python
def score(candidates, all_exits, escaped_anywhere: bool) -> Confidence:
    if escaped_anywhere:
        return Confidence.POSSIBLE
    if not candidates:
        return Confidence.SAFE
    if all(c["exit_kind"] == "exception" for c in candidates):
        return Confidence.LIKELY          # NEVER definite — see below
    if len(candidates) == len(all_exits):
        return Confidence.DEFINITE
    return Confidence.LIKELY
```

| Level | Meaning | Default CI |
|---|---|---|
| `DEFINITE` | leaks on **every** exit, never escapes | ❌ fails the build |
| `LIKELY` | leaks on some exits, or exception paths only | ⚠️ warns |
| `POSSIBLE` | escapes to an unanalysed callee | ℹ️ info |
| `SAFE` | proven closed, or context-managed | silent |

### 🔑 The exception-path rule — the most important line you write

**A leak reachable only via `exception` edges is capped at `LIKELY` and can never block a build.**

Any call can raise. Treating every exception path as build-blocking would flag most `try` blocks — exactly the "cries wolf, gets disabled by week two" failure the problem statement warns about. You *report* exception-path leaks (the PS asks for them) but never fail on a speculative one.

Put this in `docs/02-decision-log.md` with a timestamp. It is the single best answer you have for "how did you control false positives?"

---

## Task 5 — `fix/rewrite.py` (Phase 3)

**One module, three consumers:** `leakguard fix --write`, P4's VS Code 💡 quick-fix, P3's n8n PR bot. Write it once, they both call it.

Exactly two transformations. Anything else → `fix_available = False`.

### Case 1 — hoist into `with`

Conditions: resource does not escape · acquisition is a simple `x = call(...)` · a `close` exists · all uses lie between them.

```python
# before                          # after
f = open(path)                    with open(path) as f:
data = f.read()                       data = f.read()
f.close()
```

### Case 2 — wrap in `try/finally`

```python
conn = sqlite3.connect(db)
try:
    ...
finally:
    conn.close()
```

### Implementation note

Do **not** `ast.unparse()` the whole file — it destroys comments and formatting across the entire module. Splice by line range instead:

```python
def make_patch(finding, source: str) -> str | None:
    lines = source.splitlines(keepends=True)
    start = finding.acquired_line - 1
    end   = finding.close_found_at[0] if finding.close_found_at else None
    if end is None:
        return None
    indent = len(lines[start]) - len(lines[start].lstrip())
    body = [" " * 4 + l for l in lines[start + 1:end - 1]]
    new  = [" " * indent + f"with {call_expr} as {finding.variable}:\n", *body]
    return "".join(lines[:start] + new + lines[end:])
```

Comments *inside* the rewritten region survive because you're moving whole lines. Document that comments on the acquisition line itself may move.

### 🔒 Verification rule — non-negotiable

```python
patched = make_patch(finding, source)
if patched and finding.fingerprint not in {f.fingerprint for f in analyze_source(patched)}:
    return patched          # verified clean
return None                 # discard silently
```

**Never surface an unverified patch.** Re-run the analyzer on the patched source; if the finding isn't gone, throw the patch away. This is what makes the n8n fix-bot safe, and it's a direct callback to the fail-closed philosophy.

---

## Task 6 — Reporters

### `report/text.py`

```
LEAK (likely) · sqlite3.Connection · app/export.py:export

  opened   line 2    conn = sqlite3.connect(db)
  path     2 → 3 → 4 (return)
  reason   reaches function exit with conn still open
  close    line 8    unreachable from line 4

  also leaks on the exception path from line 6 (f.write may raise)

1 definite, 2 likely, 1 possible · 47 files · 412ms
```

Colour by confidence. Respect `NO_COLOR`.

### `report/json.py`

The canonical format — P3's SARIF and n8n, and P4's VS Code and dashboard all consume it. **Keep it stable after hour 8.** Schema is in README Step 8.

---

## Your test file — `tests/test_dataflow.py`

```python
def test_simple_leak_flagged():
    findings = run(simple_leak())
    assert findings[0].confidence == Confidence.DEFINITE

def test_early_return_is_likely():
    findings = run(early_return_leak())
    assert findings[0].confidence == Confidence.LIKELY
    assert [s.line for s in findings[0].leak_path] == [2, 3, 4]

def test_escape_suppresses():
    assert run(escaping_no_leak()) == []

def test_join_produces_maybe_open():
    assert join(State.OPEN, State.CLOSED) is State.MAYBE_OPEN

def test_escape_dominates_join():
    assert join(State.ESCAPED, State.CLOSED) is State.ESCAPED

def test_exception_only_never_definite():
    f = run(exception_path_leak())[0]
    assert f.confidence == Confidence.LIKELY
```

---

## Your schedule

| Hours | Task |
|---|---|
| 0–2 | Contracts with the team |
| 2–4 | `Finding` + `fingerprint()` · **JSON fixtures for P3/P4** |
| 4–7 | `State`, `join`, `transfer` — tested on P1's fixtures |
| 7–10 | Worklist fixpoint |
| 10–12 | Exit check + BFS witness path |
| 12–15 | **Escape handling + `ESCAPED` dominance** |
| 15–17 | Confidence scoring · `report/text.py`, `report/json.py` |
| 17–18 | 🔗 Integrate with P1's real CFG. Run the corpus. |
| 18–21 | Interprocedural summaries |
| 21–24 | `fix/rewrite.py` |
| 24–26 | Patch verification loop |
| 26–30 | Bug-fix · **`docs/04-limitations.md`** · rehearse |

---

## Read before hour 0

- The worklist algorithm (any dataflow-analysis primer)
- Monotone join / lattices — you only need the intuition
- README Steps 3–6

**Demo segment you own:** the keyboard hand-off. A judge writes code and you explain, live, why the tool gave the verdict it gave. Also the limitations slide — credibility comes from the person who knows the edges. Rehearse both.
