"""Small, source-preserving fixes shared by the CLI, editor, and bot."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from pathlib import Path
import re

from leakguard.core.finding import Finding


_ASSIGNMENT = re.compile(r"^(?P<indent>[ \t]*)(?P<variable>[A-Za-z_]\w*)\s*=\s*(?P<call>.+?)\s*$")


def make_patch(finding: Finding, source: str) -> str | None:
    """Hoist one simple ``x = call(); ...; x.close()`` range into ``with``.

    This transformation preserves every line between acquisition and close.  It is
    intentionally unavailable for source shapes it cannot prove safe to rewrite;
    callers must use :func:`verified_patch` before presenting a result.
    """

    if finding.escape_kind is not None:
        return None
    lines = source.splitlines(keepends=True)
    start = finding.acquired_line - 1
    if not (0 <= start < len(lines)):
        return None
    match = _ASSIGNMENT.match(lines[start].rstrip("\r\n"))
    if not match or match.group("variable") != finding.variable:
        return None
    indent = match.group("indent")
    inner_indent = indent + "    "
    if finding.close_found_at:
        end = finding.close_found_at[0] - 1
        if not (start < end < len(lines)):
            return None
        close = re.compile(rf"^[ \t]*{re.escape(finding.variable)}\.(close|shutdown)\(\)\s*(?:#.*)?$")
        if close.match(lines[end].rstrip("\r\n")):
            body = [inner_indent + line[len(indent):] if line.strip() else line for line in lines[start + 1:end]]
            replacement = [f"{indent}with {match.group('call')} as {finding.variable}:\n", *body]
            return "".join(lines[:start] + replacement + lines[end + 1:])

    # Conservative fallback: protect the remaining statements in the same
    # lexical suite with finally. Verification below rejects unsafe rewrites.
    end = start + 1
    while end < len(lines):
        text = lines[end]
        if text.strip() and len(text) - len(text.lstrip(" \t")) < len(indent):
            break
        end += 1
    body = lines[start + 1:end]
    if not body or not any(line.strip() for line in body):
        return None
    protected = [inner_indent + line[len(indent):] if line.strip() else line for line in body]
    replacement = [lines[start], f"{indent}try:\n", *protected,
                   f"{indent}finally:\n", f"{inner_indent}{finding.variable}.close()\n"]
    return "".join(lines[:start] + replacement + lines[end:])


def verified_patch(
    finding: Finding, source: str, analyze_source: Callable[[str], Iterable[Finding]]
) -> str | None:
    """Return a patch only if rerunning the analyzer removes this finding."""

    patched = make_patch(finding, source)
    if patched is None:
        return None
    try:
        remaining = {candidate.fingerprint for candidate in analyze_source(patched)}
    except (SyntaxError, ValueError):
        return None
    return patched if finding.fingerprint not in remaining else None


def apply_fixes(findings: Iterable[Finding], write: bool = False) -> list[Path]:
    """Generate only analyzer-verified fixes, optionally writing them to disk."""
    from leakguard.config import Config
    from leakguard.core.pipeline import analyze_source

    grouped: dict[Path, list[Finding]] = defaultdict(list)
    for finding in findings:
        if finding.fix_available:
            grouped[Path(finding.file)].append(finding)

    changed: list[Path] = []
    for path, file_findings in grouped.items():
        try:
            original = path.read_text(encoding="utf-8")
        except OSError:
            continue
        source = original
        for finding in sorted(file_findings, key=lambda item: item.acquired_line, reverse=True):
            patched = verified_patch(
                finding,
                source,
                lambda candidate, p=path: analyze_source(candidate, str(p).replace("\\", "/"), Config()),
            )
            if patched is not None:
                source = patched
        if source != original:
            changed.append(path)
            if write:
                path.write_text(source, encoding="utf-8")
    return changed
