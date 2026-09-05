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
            if finding.resource == "builtins.file":
                replacement = [f"{indent}with {match.group('call')} as {finding.variable}:\n", *body]
            else:
                close_text = lines[end][len(indent):] if lines[end].startswith(indent) else lines[end].lstrip()
                replacement = [lines[start], f"{indent}try:\n", *body,
                               f"{indent}finally:\n", f"{inner_indent}{close_text}"]
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


#: A file with N independent leaks needs at most N rounds; the cap is a guard
#: against a pathological case, not an expected limit.
MAX_ROUNDS = 10


def apply_fixes(findings: Iterable[Finding], write: bool = False) -> list[Path]:
    """Generate only analyzer-verified fixes, optionally writing them to disk.

    Fixes are applied round by round, re-analysing the patched source each
    time, until a round makes no progress.

    A single pass is not enough. Every ``Finding`` carries line numbers from
    the source it was produced against, so the moment one patch lands the
    remaining findings for that file describe a file that no longer exists:
    their ``acquired_line`` and ``close_found_at`` point at shifted lines,
    ``make_patch`` fails to match, and the leaks are silently left behind.
    Re-deriving the findings after each round keeps them in step with the
    text being edited.
    """
    from leakguard.config import Config
    from leakguard.core.pipeline import analyze_source

    grouped: dict[Path, list[Finding]] = defaultdict(list)
    for finding in findings:
        if finding.fix_available:
            grouped[Path(finding.file)].append(finding)

    changed: list[Path] = []
    for path in grouped:
        try:
            original = path.read_text(encoding="utf-8")
        except OSError:
            continue

        name = str(path).replace("\\", "/")
        analyze = lambda candidate, n=name: analyze_source(candidate, n, Config())
        source = original

        for _ in range(MAX_ROUNDS):
            try:
                current = [f for f in analyze(source) if f.fix_available]
            except (SyntaxError, ValueError):
                break
            if not current:
                break

            progressed = False
            # Highest line first, so an earlier edit cannot shift a later one.
            for finding in sorted(current, key=lambda item: item.acquired_line, reverse=True):
                patched = verified_patch(finding, source, analyze)
                if patched is not None:
                    source = patched
                    progressed = True
                    break  # findings are now stale; re-derive them
            if not progressed:
                break

        if source != original:
            changed.append(path)
            if write:
                path.write_text(source, encoding="utf-8")
    return changed
