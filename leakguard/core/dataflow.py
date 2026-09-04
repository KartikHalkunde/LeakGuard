"""AST-independent forward typestate analysis over LeakGuard CFGs."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Mapping

from .cfg import CFG
from .confidence import score
from .escape import Summary
from .finding import Confidence, Finding, PathStep
from .ir import Acquire, Alias, CallSite, Escape, Event, Release, Scoped


class State(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    MAYBE_OPEN = "maybe_open"
    ESCAPED = "escaped"


class TooComplex(RuntimeError):
    def __init__(self, func_name: str, max_blocks: int = 500):
        super().__init__(f"{func_name} has more than {max_blocks} basic blocks")
        self.func_name = func_name
        self.max_blocks = max_blocks


MAX_BLOCKS = 500


def join(a: State | None, b: State | None) -> State | None:
    if a is None:
        return b
    if b is None:
        return a
    if State.ESCAPED in (a, b):
        return State.ESCAPED
    if a == b:
        return a
    return State.MAYBE_OPEN


def join_all(states: list[dict[str, State]]) -> dict[str, State]:
    out: dict[str, State] = {}
    for state in states:
        for var, value in state.items():
            joined = join(out.get(var), value)
            assert joined is not None
            out[var] = joined
    return out


def _alias_groups(cfg: CFG) -> dict[str, frozenset[str]]:
    """Build static alias families so closing an alias closes its source too."""

    parent: dict[str, str] = {}

    def find(value: str) -> str:
        parent.setdefault(value, value)
        if parent[value] != value:
            parent[value] = find(parent[value])
        return parent[value]

    def union(left: str, right: str) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    for block in cfg.blocks.values():
        for event in block.events:
            if isinstance(event, Alias):
                union(event.src, event.dst)
    groups: dict[str, set[str]] = defaultdict(set)
    for var in parent:
        groups[find(var)].add(var)
    return {var: frozenset(groups[find(var)]) for var in parent}


def _set_family(
    state: dict[str, State], var: str, value: State, aliases: Mapping[str, frozenset[str]]
) -> None:
    for name in aliases.get(var, frozenset({var})):
        state[name] = value


def transfer(
    state: dict[str, State], event: Event, summaries: Mapping[str, Summary] | None = None,
    aliases: Mapping[str, frozenset[str]] | None = None,
) -> dict[str, State]:
    """Apply one IR event.  The input map is never mutated."""

    summaries = summaries or {}
    aliases = aliases or {}
    out = dict(state)
    match event:
        case Acquire(var=var):
            _set_family(out, var, State.OPEN, aliases)
        case Release(var=var):
            _set_family(out, var, State.CLOSED, aliases)
        case Escape(var=var):
            _set_family(out, var, State.ESCAPED, aliases)
        case Scoped(var=var):
            _set_family(out, var, State.CLOSED, aliases)
        case Alias(src=source, dst=destination):
            if source in out:
                _set_family(out, destination, out[source], aliases)
        case CallSite(callee=callee, args=args):
            summary = summaries.get(callee)
            if summary:
                for index in summary.closes_arg:
                    if index < len(args) and args[index] in out:
                        _set_family(out, args[index], State.CLOSED, aliases)
    return out


def solve(
    cfg: CFG, summaries: Mapping[str, Summary] | None = None, max_blocks: int = MAX_BLOCKS
) -> dict[int, dict[str, State]]:
    """Compute each block's outgoing state using a monotone worklist algorithm."""

    if len(cfg.blocks) > max_blocks:
        raise TooComplex(cfg.func_name, max_blocks)
    summaries = summaries or {}
    aliases = _alias_groups(cfg)
    inbound = {block: {} for block in cfg.blocks}
    outbound = {block: {} for block in cfg.blocks}
    worklist = deque([cfg.entry])
    processed: set[int] = set()
    while worklist:
        block_id = worklist.popleft()
        predecessors = cfg.preds(block_id)
        inbound[block_id] = join_all([outbound[parent] for parent in predecessors]) if predecessors else {}
        state = dict(inbound[block_id])
        for event in cfg.blocks[block_id].events:
            state = transfer(state, event, summaries, aliases)
        if block_id not in processed or state != outbound[block_id]:
            outbound[block_id] = state
            processed.add(block_id)
            worklist.extend(cfg.succs(block_id))
    return outbound


@dataclass(frozen=True)
class LeakCandidate:
    var: str
    exit: int
    state: State
    exit_kind: str
    path: list[int]


def bfs_path(cfg: CFG, src: int, dst: int) -> list[int]:
    previous: dict[int, int | None] = {src: None}
    queue = deque([src])
    while queue:
        block = queue.popleft()
        if block == dst:
            path: list[int] = []
            while block is not None:
                path.append(block)
                block = previous[block]
            return list(reversed(path))
        for successor in cfg.succs(block):
            if successor not in previous:
                previous[successor] = block
                queue.append(successor)
    return []


def _acquire_blocks(cfg: CFG) -> dict[str, tuple[int, Acquire]]:
    found: dict[str, tuple[int, Acquire]] = {}
    for block_id, block in cfg.blocks.items():
        for event in block.events:
            if isinstance(event, Acquire):
                found.setdefault(event.var, (block_id, event))
    return found


def _exit_kind(cfg: CFG, exit_block: int) -> str:
    if cfg.blocks[exit_block].kind == "exception_exit":
        return "exception"
    predecessors = cfg.preds(exit_block)
    if not predecessors:
        return "fallthrough"
    return cfg.edge_kind(predecessors[0], exit_block) or "fallthrough"


def check_exits(
    cfg: CFG, outbound: Mapping[int, dict[str, State]], acquisitions: Mapping[str, tuple[int, Acquire]] | None = None
) -> list[LeakCandidate]:
    acquisitions = acquisitions or _acquire_blocks(cfg)
    candidates: list[LeakCandidate] = []
    for exit_block in cfg.exits:
        for var, state in outbound[exit_block].items():
            if state in (State.OPEN, State.MAYBE_OPEN) and var in acquisitions:
                candidates.append(
                    LeakCandidate(var, exit_block, state, _exit_kind(cfg, exit_block), bfs_path(cfg, acquisitions[var][0], exit_block))
                )
    return candidates


def _all_events(cfg: CFG) -> list[Event]:
    return [event for block in cfg.blocks.values() for event in block.events]


def _path_steps(cfg: CFG, path: list[int], acquire: Acquire, var: str) -> list[PathStep]:
    steps = [PathStep(acquire.line, f"{var} opened here")]
    if path:
        origin = cfg.blocks[path[0]]
        if origin.line_end > acquire.line:
            steps.append(PathStep(origin.line_end, "branch taken"))
    for block_id in path[1:]:
        block = cfg.blocks[block_id]
        line = block.line_start or block.line_end
        if not line or line == acquire.line:
            continue
        if block.kind in {"exit", "exception_exit"}:
            note = "exception exits with resource still open" if block.kind == "exception_exit" else "function exits with resource still open"
        else:
            note = "control flow continues"
        steps.append(PathStep(line, note))
    return steps


def analyze_cfg(cfg: CFG, summaries: Mapping[str, Summary] | None = None) -> list[Finding]:
    """Turn one P1 CFG into stable P2 findings.

    Resources that escape are intentionally silent: their lifetime belongs to an
    unanalysed caller/owner and presenting them as leaks would be a false positive.
    """

    try:
        outbound = solve(cfg, summaries)
    except TooComplex as error:
        return [
            Finding(
                Confidence.POSSIBLE, "<analysis>", cfg.file, cfg.func_name, "<function>", 0, 0, "",
                reason=str(error), severity="info",
            )
        ]
    acquisitions = _acquire_blocks(cfg)
    candidates = check_exits(cfg, outbound, acquisitions)
    events = _all_events(cfg)
    findings: list[Finding] = []
    for ordinal, (var, (_, acquire)) in enumerate(acquisitions.items()):
        escaped = [event for event in events if isinstance(event, Escape) and event.var == var]
        if escaped:
            continue
        var_candidates = [candidate for candidate in candidates if candidate.var == var]
        confidence = score(
            [candidate.__dict__ for candidate in var_candidates], cfg.exits, escaped_anywhere=bool(escaped)
        )
        if confidence is Confidence.SAFE:
            continue
        primary = var_candidates[0]
        close_lines = [event.line for event in events if isinstance(event, Release) and event.var == var]
        unreachable = primary.path[-1] if primary.path else None
        reason = f"reaches {primary.exit_kind} exit with {var} still open"
        if close_lines:
            reason += f"; close() at line {close_lines[0]} is unreachable on this path"
        findings.append(
            Finding(
                confidence=confidence,
                resource=acquire.resource,
                file=cfg.file,
                function=cfg.func_name,
                variable=var,
                acquired_line=acquire.line,
                acquired_col=acquire.col,
                snippet=acquire.snippet,
                leak_path=_path_steps(cfg, primary.path, acquire, var),
                close_found_at=close_lines,
                close_unreachable_from=unreachable,
                exit_kind=primary.exit_kind,
                reason=reason,
                fix_available=bool(close_lines),
                severity="high" if confidence is Confidence.DEFINITE else "medium",
                ordinal=ordinal,
                block_path=primary.path,
            )
        )
    return findings
