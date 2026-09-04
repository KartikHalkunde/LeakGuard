"""Small, source-preserving fixes shared by the CLI, editor, and bot."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from collections import defaultdict
from pathlib import Path
import re
import tempfile

from leakguard.core.finding import Finding


_ASSIGNMENT = re.compile(r"^(?P<indent>[ \t]*)(?P<variable>[A-Za-z_]\w*)\s*=\s*(?P<call>.+?)\s*$")


def _rewrite_parts(finding: Finding, source: str):
    """Return validated source parts shared by both narrow transformations."""

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
    return lines, start, end, match


def _relative_body(lines: list[str], start: int, end: int, indent: str) -> list[str]:
    inner_indent = indent + "    "
    return [
        inner_indent + line[len(indent):] if line.strip() and line.startswith(indent) else line
        for line in lines[start + 1:end]
    ]


def _with_patch(finding: Finding, source: str) -> str | None:
    """Hoist a simple file acquisition into a context manager."""

    parts = _rewrite_parts(finding, source)
    if parts is None:
        return None
    lines, start, end, match = parts
    indent = match.group("indent")
    replacement = [f"{indent}with {match.group('call')} as {finding.variable}:\n", *_relative_body(lines, start, end, indent)]
    return "".join(lines[:start] + replacement + lines[end + 1:])


def _try_finally_patch(finding: Finding, source: str) -> str | None:
    """Wrap a non-file resource's existing close in a source-preserving finally."""

    parts = _rewrite_parts(finding, source)
    if parts is None:
        return None
    lines, start, end, match = parts
    indent = match.group("indent")
    inner = indent + "    "
    close_line = lines[end]
    relative_close = close_line[len(indent):] if close_line.startswith(indent) else close_line.lstrip()
    replacement = [
        lines[start],
        f"{indent}try:\n",
        *_relative_body(lines, start, end, indent),
        f"{indent}finally:\n",
        inner + relative_close,
    ]
    return "".join(lines[:start] + replacement + lines[end + 1:])


def make_patch(finding: Finding, source: str) -> str | None:
    """Apply one of LeakGuard's two deliberately constrained transformations.

    Files use ``with``; all other resources use ``try/finally``. Both preserve
    the original body lines, including comments, and must be verified by the
    caller before being written.
    """
    return _with_patch(finding, source) if finding.resource == "builtins.file" else _try_finally_patch(finding, source)


def verified_patch(
    finding: Finding, source: str, analyze_source: Callable[[str], Iterable[Finding]]
) -> str | None:
    """Return a patch only if rerunning the analyzer removes this finding."""

    patched = make_patch(finding, source)
    if patched is None:
        return None
    remaining = {candidate.fingerprint for candidate in analyze_source(patched)}
    return patched if finding.fingerprint not in remaining else None


def _same_acquisition(left: Finding, right: Finding) -> bool:
    """Compare a finding across a temporary file path used for verification."""

    return (
        left.variable == right.variable
        and left.resource == right.resource
        and left.snippet == right.snippet
    )


def apply_fixes(findings: Iterable[Finding], *, write: bool = False) -> list[Path]:
    """Apply only patches that the real analyzer proves remove the finding.

    Verification happens in a temporary copy, so a dry run never changes user
    source.  ``write=True`` writes only the verified complete replacement.
    """

    from leakguard.core.pipeline import analyze_file

    by_file: dict[Path, list[Finding]] = defaultdict(list)
    for finding in findings:
        if finding.fix_available:
            by_file[Path(finding.file)].append(finding)

    changed: list[Path] = []
    for path, file_findings in by_file.items():
        try:
            original = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        patched = original
        for finding in sorted(file_findings, key=lambda item: item.acquired_line, reverse=True):
            candidate = make_patch(finding, patched)
            if candidate is None:
                continue
            with tempfile.TemporaryDirectory() as directory:
                temporary = Path(directory) / path.name
                temporary.write_text(candidate, encoding="utf-8")
                remaining = analyze_file(temporary)
            if not any(_same_acquisition(finding, result) for result in remaining):
                patched = candidate
        if patched == original:
            continue
        if write:
            path.write_text(patched, encoding="utf-8")
        changed.append(path)
    return changed
