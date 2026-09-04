"""Resource catalogue loading.

P1's CFG builder calls `Catalog.match_acquire()` / `match_release()` to decide
whether a call is an acquisition or a release.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

CATALOG_PATH = Path(__file__).with_name("resources.yaml")


@dataclass
class ResourceDef:
    id: str
    acquire: list[str] = field(default_factory=list)
    release: list[str] = field(default_factory=list)
    context_manager: bool = True
    severity: str = "medium"
    scarcity: str = "fd"


@dataclass
class Catalog:
    definitions: list[ResourceDef] = field(default_factory=list)
    #: fully-qualified acquire callable -> resource id
    _acquire_index: dict[str, str] = field(default_factory=dict, repr=False)
    #: release method name -> set of resource ids that accept it
    _release_index: dict[str, set[str]] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self.reindex()

    def reindex(self) -> None:
        self._acquire_index = {}
        self._release_index = {}
        for d in self.definitions:
            for call in d.acquire:
                self._acquire_index[call] = d.id
            for method in d.release:
                self._release_index.setdefault(method, set()).add(d.id)

    # -- lookups used by P1's builder ------------------------------------
    def match_acquire(self, dotted_name: str | None) -> str | None:
        """Return the resource id for a fully-qualified callable, or None.

        Falls back to a last-segment match so `connect(...)` resolves after
        `from sqlite3 import connect`.
        """
        if not dotted_name:
            return None
        if dotted_name in self._acquire_index:
            return self._acquire_index[dotted_name]
        tail = dotted_name.rsplit(".", 1)[-1]
        for call, rid in self._acquire_index.items():
            if call.rsplit(".", 1)[-1] == tail:
                return rid
        return None

    def match_release(self, method: str, resource_id: str | None = None) -> bool:
        ids = self._release_index.get(method)
        if not ids:
            return False
        return resource_id in ids if resource_id else True

    def is_context_manager(self, resource_id: str) -> bool:
        for d in self.definitions:
            if d.id == resource_id:
                return d.context_manager
        return False

    def severity_of(self, resource_id: str) -> str:
        for d in self.definitions:
            if d.id == resource_id:
                return d.severity
        return "medium"

    def extend(self, extra: list[dict]) -> None:
        """Merge user-defined resources from .leakguard.toml."""
        for raw in extra:
            self.definitions.append(
                ResourceDef(
                    id=raw["id"],
                    acquire=list(raw.get("acquire", [])),
                    release=list(raw.get("release", ["close"])),
                    context_manager=bool(raw.get("context_manager", True)),
                    severity=raw.get("severity", "medium"),
                    scarcity=raw.get("scarcity", "fd"),
                )
            )
        self.reindex()


@lru_cache(maxsize=1)
def _builtin_definitions() -> tuple[ResourceDef, ...]:
    data = yaml.safe_load(CATALOG_PATH.read_text(encoding="utf-8"))
    return tuple(
        ResourceDef(
            id=r["id"],
            acquire=list(r.get("acquire", [])),
            release=list(r.get("release", ["close"])),
            context_manager=bool(r.get("context_manager", True)),
            severity=r.get("severity", "medium"),
            scarcity=r.get("scarcity", "fd"),
        )
        for r in data.get("resources", [])
    )


def load_catalog(extra: list[dict] | None = None) -> Catalog:
    cat = Catalog(definitions=list(_builtin_definitions()))
    if extra:
        cat.extend(extra)
    return cat
