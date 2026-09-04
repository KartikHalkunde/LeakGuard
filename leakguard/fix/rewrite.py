"""Small, source-preserving fixes shared by the CLI, editor, and bot."""

from __future__ import annotations

from collections.abc import Callable, Iterable
import re

from leakguard.core.finding import Finding


_ASSIGNMENT = re.compile(r"^(?P<indent>[ \t]*)(?P<variable>[A-Za-z_]\w*)\s*=\s*(?P<call>.+?)\s*$")


def make_patch(finding: Finding, source: str) -> str | None:
    """Hoist one simple ``x = call(); ...; x.close()`` range into ``with``.

    This transformation preserves every line between acquisition and close.  It is
    intentionally unavailable for source shapes it cannot prove safe to rewrite;
    callers must use :func:`verified_patch` before presenting a result.
    """

    if not finding.close_found_at or finding.escape_kind is not None:
        return None
    lines = source.splitlines(keepends=True)
    start = finding.acquired_line - 1
    end = finding.close_found_at[0] - 1
    if not (0 <= start < end < len(lines)):
        return None
    match = _ASSIGNMENT.match(lines[start].rstrip("\r\n"))
    if not match or match.group("variable") != finding.variable:
        return None
    close = re.compile(rf"^[ \t]*{re.escape(finding.variable)}\.(close|shutdown)\(\)\s*(?:#.*)?$")
    if not close.match(lines[end].rstrip("\r\n")):
        return None
    indent = match.group("indent")
    inner_indent = indent + "    "
    body = [inner_indent + line if line.strip() else line for line in lines[start + 1:end]]
    replacement = [f"{indent}with {match.group('call')} as {finding.variable}:\n", *body]
    return "".join(lines[:start] + replacement + lines[end + 1:])


def verified_patch(
    finding: Finding, source: str, analyze_source: Callable[[str], Iterable[Finding]]
) -> str | None:
    """Return a patch only if rerunning the analyzer removes this finding."""

    patched = make_patch(finding, source)
    if patched is None:
        return None
    remaining = {candidate.fingerprint for candidate in analyze_source(patched)}
    return patched if finding.fingerprint not in remaining else None
