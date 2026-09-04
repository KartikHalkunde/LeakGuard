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


def _acquisition_failure_only(cfg: CFG, exit_block: int) -> bool:
    if cfg.blocks[exit_block].kind != "exception_exit":
        return False
    predecessors = cfg.preds(exit_block)
    if not predecessors:
        return False
    for predecessor in predecessors:
        normal_successors = [
            edge.dst for edge in cfg.edges
            if edge.src == predecessor and edge.kind == "normal"
        ]
        if not any(
            any(isinstance(event, Acquire) for event in cfg.blocks[successor].events)
            for successor in normal_successors
        ):
            return False
    return True


def check_exits(
    cfg: CFG, outbound: Mapping[int, dict[str, State]], acquisitions: Mapping[str, tuple[int, Acquire]] | None = None
) -> list[LeakCandidate]:
    acquisitions = acquisitions or _acquire_blocks(cfg)
    candidates: list[LeakCandidate] = []
    for exit_block in cfg.exits:
        if _acquisition_failure_only(cfg, exit_block):
            continue
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
    summaries = summaries or {}
    acquisitions = _acquire_blocks(cfg)
    candidates = check_exits(cfg, outbound, acquisitions)
    events = _all_events(cfg)
    findings: list[Finding] = []
    for ordinal, (var, (_, acquire)) in enumerate(acquisitions.items()):
        escaped = [event for event in events if isinstance(event, Escape) and event.var == var]
        effective_escapes = [
            event for event in escaped
            if not (
                event.kind == "call_arg"
                and event.target in summaries
                and summaries[event.target].closes_arg
            )
        ]
        ownership_escapes = [event for event in effective_escapes if event.kind != "call_arg"]
        if ownership_escapes:
            continue
        var_candidates = [candidate for candidate in candidates if candidate.var == var]
        reachable_exits = [
            exit_id for exit_id in cfg.exits
            if (cfg.preds(exit_id) or exit_id == cfg.entry) and not _acquisition_failure_only(cfg, exit_id)
        ]
        confidence = score(
            [candidate.__dict__ for candidate in var_candidates],
            reachable_exits,
            escaped_anywhere=bool(effective_escapes),
        )
        if confidence is Confidence.SAFE:
            continue
        primary = var_candidates[0] if var_candidates else None
        close_lines = [event.line for event in events if isinstance(event, Release) and event.var == var]
        unreachable = None
        if primary and primary.path:
            witness_block = cfg.blocks[primary.path[-2] if len(primary.path) > 1 else primary.path[-1]]
            unreachable = witness_block.line_end or witness_block.line_start or acquire.line
        escape = effective_escapes[0] if effective_escapes else None
        exit_kind = primary.exit_kind if primary else "escape"
        block_path = primary.path if primary else [acquisitions[var][0]]
        reason = (
            f"ownership of {var} passes to unresolved call {escape.target}"
            if escape else f"reaches {exit_kind} exit with {var} still open"
        )
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
                leak_path=_path_steps(cfg, block_path, acquire, var),
                close_found_at=close_lines,
                close_unreachable_from=unreachable,
                exit_kind=exit_kind,
                reason=reason,
                fix_available=confidence in {Confidence.DEFINITE, Confidence.LIKELY},
                severity="high" if confidence is Confidence.DEFINITE else "medium",
                ordinal=ordinal,
                escape_kind=escape.kind if escape else None,
                block_path=block_path,
            )
        )
    # Reassigning an open variable loses the previous handle even if the final
    # handle is later closed. Represent that lost generation as a finding.
    by_var: dict[str, list[tuple[int, Acquire]]] = defaultdict(list)
    for block_id, block in cfg.blocks.items():
        for event in block.events:
            if isinstance(event, Acquire):
                by_var[event.var].append((block_id, event))
    for var, generations in by_var.items():
        for position, (block_id, acquire) in enumerate(generations[:-1]):
            next_block, next_acquire = generations[position + 1]
            path_between = bfs_path(cfg, block_id, next_block)
            if not path_between:
                continue
            released_between = False
            for path_block in path_between:
                block_events = cfg.blocks[path_block].events
                start = block_events.index(acquire) + 1 if path_block == block_id and acquire in block_events else 0
                end = block_events.index(next_acquire) if path_block == next_block and next_acquire in block_events else len(block_events)
                if any(isinstance(event, Release) and event.var == var for event in block_events[start:end]):
                    released_between = True
            if released_between:
                continue
            if any(f.variable == var and f.acquired_line == acquire.line for f in findings):
                continue
            findings.append(Finding(
                confidence=Confidence.DEFINITE,
                resource=acquire.resource,
                file=cfg.file,
                function=cfg.func_name,
                variable=var,
                acquired_line=acquire.line,
                acquired_col=acquire.col,
                snippet=acquire.snippet,
                leak_path=[PathStep(acquire.line, f"{var} opened here"),
                           PathStep(next_acquire.line, f"{var} overwritten before close")],
                exit_kind="overwrite",
                reason=f"{var} is overwritten while its previous resource is still open",
                severity="high",
                ordinal=len(findings),
                block_path=[block_id],
            ))
        # A loop-body acquisition without a loop-body release overwrites the
        # previous iteration's live handle. A close after the loop closes only
        # the final generation.
        for block_id, acquire in generations:
            block = cfg.blocks[block_id]
            if any(isinstance(event, Escape) and event.var == var for event in events):
                continue
            if any(isinstance(event, Release) and event.var == var for event in block.events):
                continue
            seen: set[int] = set()
            queue = deque(cfg.succs(block_id))
            cyclic = False
            while queue:
                current = queue.popleft()
                if current == block_id:
                    cyclic = True
                    break
                if current not in seen:
                    seen.add(current)
                    queue.extend(cfg.succs(current))
            if not cyclic or any(f.variable == var and f.acquired_line == acquire.line for f in findings):
                continue
            findings.append(Finding(
                confidence=Confidence.LIKELY,
                resource=acquire.resource,
                file=cfg.file,
                function=cfg.func_name,
                variable=var,
                acquired_line=acquire.line,
                acquired_col=acquire.col,
                snippet=acquire.snippet,
                leak_path=[PathStep(acquire.line, f"{var} reopened on each loop iteration")],
                exit_kind="loop",
                reason=f"{var} is acquired repeatedly in a loop but not released in the loop body",
                severity="medium",
                ordinal=len(findings),
                block_path=[block_id],
            ))
    return findings
