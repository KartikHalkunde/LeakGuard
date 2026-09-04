from __future__ import annotations

from leakguard.core.cfg import CFG
from leakguard.core.ir import Acquire, Alias, CallSite, Escape, Release, Scoped


def summarize(events: list[object]) -> str:
    parts: list[str] = []
    for event in events:
        if isinstance(event, Acquire): parts.append(f"{event.var} = acquire {event.resource}")
        elif isinstance(event, Release): parts.append(f"{event.var}.close()")
        elif isinstance(event, Escape): parts.append(f"{event.var} escapes ({event.kind})")
        elif isinstance(event, Scoped): parts.append(f"with {event.resource} as {event.var}")
        elif isinstance(event, Alias): parts.append(f"{event.dst} = {event.src}")
        elif isinstance(event, CallSite): parts.append(f"call {event.callee}")
    return "; ".join(parts) or "flow"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', "&quot;").replace("\n", " ")


def to_mermaid(cfg: CFG, leak_path: list[int]) -> str:
    lines = ["graph TD"]
    for bid, block in cfg.blocks.items():
        label = f"L{block.line_start}-{block.line_end}" if block.line_end > block.line_start else f"L{block.line_start}"
        lines.append(f'    B{bid}["{_escape(label + ": " + summarize(block.events))}"]')
    for edge in cfg.edges:
        arrow = f"-->|{edge.kind}|" if edge.kind != "normal" else "-->"
        lines.append(f"    B{edge.src} {arrow} B{edge.dst}")
    for bid in dict.fromkeys(leak_path):
        if bid in cfg.blocks: lines.append(f"    style B{bid} fill:#ff6b6b,stroke:#c92a2a")
    return "\n".join(lines)

