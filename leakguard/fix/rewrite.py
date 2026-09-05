"""Small, source-preserving fixes shared by the CLI, editor, and bot."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from pathlib import Path
import re

from leakguard.core.finding import Finding


_ASSIGNMENT = re.compile(r"^(?P<indent>[ \t]*)(?P<variable>[A-Za-z_]\w*)\s*=\s*(?P<call>.+?)\s*$")


def _suite_end(lines: list[str], start: int, indent: str) -> int:
    """Index just past the last line of the suite the acquisition sits in."""
    end = start + 1
    while end < len(lines):
        text = lines[end]
        if text.strip() and len(text) - len(text.lstrip(" \t")) < len(indent):
            break
        end += 1
    return end


def _reindent(lines: list[str], indent: str, extra: str = "    ") -> list[str]:
    return [indent + extra + line[len(indent):] if line.strip() else line for line in lines]


def candidate_patches(finding: Finding, source: str) -> list[str]:
    """Every rewrite worth trying for this finding, best first.

    Returned candidates are not guaranteed correct - some will not even parse.
    :func:`verified_patch` re-runs the analyzer on each and keeps the first
    that provably removes the leak, so an unsound rewrite is discarded rather
    than shipped.
    """
    if finding.escape_kind is not None:
        return []

    lines = source.splitlines(keepends=True)
    start = finding.acquired_line - 1
    if not (0 <= start < len(lines)):
        return []

    match = _ASSIGNMENT.match(lines[start].rstrip("\r\n"))
    if not match or match.group("variable") != finding.variable:
        return []

    indent = match.group("indent")
    inner = indent + "    "
    candidates: list[str] = []

    close_pattern = re.compile(
        rf"^(?P<indent>[ \t]*){re.escape(finding.variable)}\.(close|shutdown)\(\)\s*(?:#.*)?$"
    )

    if finding.close_found_at:
        end = finding.close_found_at[0] - 1
        if start < end < len(lines):
            close_match = close_pattern.match(lines[end].rstrip("\r\n"))
            # Only lift the close out when it is a sibling of the acquisition.
            # A close nested inside `if verbose:` is the body of that branch;
            # deleting it leaves a header with no suite, which does not parse.
            sibling = close_match is not None and close_match.group("indent") == indent
            if sibling:
                body = _reindent(lines[start + 1:end], indent)
                if finding.resource == "builtins.file":
                    candidates.append("".join(
                        lines[:start]
                        + [f"{indent}with {match.group('call')} as {finding.variable}:\n", *body]
                        + lines[end + 1:]
                    ))
                close_text = (lines[end][len(indent):] if lines[end].startswith(indent)
                              else lines[end].lstrip())
                candidates.append("".join(
                    lines[:start]
                    + [lines[start], f"{indent}try:\n", *body,
                       f"{indent}finally:\n", f"{inner}{close_text}"]
                    + lines[end + 1:]
                ))

    # General strategy: protect everything after the acquisition, in the same
    # suite, with try/finally. This covers the shapes the sibling rewrite
    # cannot touch - a close reached only on one branch, only inside an except
    # handler, or a resource acquired once per loop iteration.
    end = _suite_end(lines, start, indent)
    body = lines[start + 1:end]
    if body and any(line.strip() for line in body):

        def wrap(inner_body: list[str]) -> str:
            return "".join(
                lines[:start]
                + [lines[start], f"{indent}try:\n", *_reindent(inner_body, indent),
                   f"{indent}finally:\n", f"{inner}{finding.variable}.close()\n"]
                + lines[end:]
            )

        # Keeping the original close is harmless at runtime - close() is
        # idempotent across the types we track - but a conditional close
        # inside the try currently defeats the analyzer, which then reports
        # the finally as unreachable and rejects an otherwise correct fix.
        # So also offer the body with those closes removed, and with them
        # replaced by `pass` for the case where the close was the whole suite
        # of a branch and deleting it would leave a header with no body.
        kept, dropped, blanked = [], [], []
        for line in body:
            kept.append(line)
            if close_pattern.match(line.rstrip("\r\n")):
                blanked.append(line[: len(line) - len(line.lstrip(" \t"))] + "pass\n")
            else:
                dropped.append(line)
                blanked.append(line)

        candidates.append(wrap(kept))
        if dropped != kept and any(line.strip() for line in dropped):
            candidates.append(wrap(dropped))
        if blanked != kept:
            candidates.append(wrap(blanked))

    return candidates


def make_patch(finding: Finding, source: str) -> str | None:
    """The single best-guess rewrite, or None. Prefer :func:`verified_patch`."""
    candidates = candidate_patches(finding, source)
    return candidates[0] if candidates else None


def verified_patch(
    finding: Finding, source: str, analyze_source: Callable[[str], Iterable[Finding]]
) -> str | None:
    """Return the first candidate the analyzer confirms removes this finding.

    The rewriter proposes; the analyzer judges. A candidate that fails to
    parse, or that leaves the leak in place, is discarded silently and the
    next one is tried.
    """
    for patched in candidate_patches(finding, source):
        try:
            remaining = {candidate.fingerprint for candidate in analyze_source(patched)}
        except (SyntaxError, ValueError):
            continue
        if finding.fingerprint not in remaining:
            return patched
    return None


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
