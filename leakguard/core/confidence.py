"""Confidence policy for resource-leak candidates."""

from __future__ import annotations

from collections.abc import Sequence

from .finding import Confidence


def score(
    candidates: Sequence[dict[str, object]],
    all_exits: Sequence[int],
    escaped_anywhere: bool = False,
) -> Confidence:
    """Classify a resource without allowing speculative paths to block CI."""

    if escaped_anywhere:
        return Confidence.POSSIBLE
    if not candidates:
        return Confidence.SAFE
    if all(candidate["exit_kind"] == "exception" for candidate in candidates):
        return Confidence.LIKELY
    if len({candidate["exit"] for candidate in candidates}) == len(set(all_exits)):
        return Confidence.DEFINITE
    return Confidence.LIKELY
