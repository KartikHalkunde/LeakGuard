from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union


@dataclass(frozen=True)
class Acquire:
    var: str
    resource: str
    line: int
    col: int
    snippet: str


@dataclass(frozen=True)
class Release:
    var: str
    line: int


@dataclass(frozen=True)
class Escape:
    var: str
    kind: Literal["return", "attribute", "container", "call_arg", "global", "yield", "closure"]
    line: int
    target: str | None = None


@dataclass(frozen=True)
class Scoped:
    """A resource managed by a ``with`` block and closed by construction."""

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

