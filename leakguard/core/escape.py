"""One-level interprocedural summaries for resource ownership helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from .cfg import CFG
from .ir import Acquire, Escape, Release


@dataclass(frozen=True)
class Summary:
    returns_resource: str | None = None
    closes_arg: frozenset[int] = field(default_factory=frozenset)


def build_summaries(
    module_cfgs: Mapping[str, CFG], params_by_function: Mapping[str, list[str]] | None = None
) -> dict[str, Summary]:
    """Return the resource-return and parameter-close facts for each function.

    CFG intentionally contains no AST metadata.  Parameter names are therefore an
    optional parser-supplied mapping, keeping this module fully IR/CFG based.
    """

    params_by_function = params_by_function or {}
    summaries: dict[str, Summary] = {}
    for name, cfg in module_cfgs.items():
        acquisitions = {
            event.var: event.resource
            for block in cfg.blocks.values()
            for event in block.events
            if isinstance(event, Acquire)
        }
        returns_resource: str | None = None
        closes_arg: set[int] = set()
        params = params_by_function.get(name, [])
        for block in cfg.blocks.values():
            for event in block.events:
                if isinstance(event, Escape) and event.kind == "return":
                    returns_resource = acquisitions.get(event.var, returns_resource)
                elif isinstance(event, Release) and event.var in params:
                    closes_arg.add(params.index(event.var))
        summaries[name] = Summary(returns_resource, frozenset(closes_arg))
    return summaries
