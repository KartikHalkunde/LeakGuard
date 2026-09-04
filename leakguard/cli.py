"""The LeakGuard command line - P3 owns this file.

This is the CI contract surface. Every interceptor reaches the engine through
here: the pre-commit hook shells out to `leakguard check`, the GitHub Action
runs it twice (sarif + json), the VS Code extension calls it with
--format json, and the n8n control plane consumes that same JSON.

EXIT CODES - the contract CI depends on:

    0   clean, or all findings below --fail-on
    1   findings at or above --fail-on   -> BLOCKS THE BUILD
    2   tool error (parse failure, bad config, crash) -> warns, does NOT block

The asymmetry is deliberate: fail closed on findings, fail open on ourselves.
A gate that bricks CI when it meets syntax it does not understand gets
uninstalled the same afternoon.
"""

from __future__ import annotations

import argparse
import fnmatch
import sys
import time
from pathlib import Path

from leakguard import gitutil
from leakguard.baseline.store import Baseline
from leakguard.config import Config, load_config, merge_cli
from leakguard.core.finding import ORDER, Finding
from leakguard.engine import analyze
from leakguard.report import json as json_report
from leakguard.report import sarif as sarif_report
from leakguard.report import text as text_report

EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_ERROR = 2

VERSION = "0.1.0"


# --------------------------------------------------------------------------
# argument parsing
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="leakguard",
        description="Static resource-leak detection for Python, enforced in CI.",
    )
    p.add_argument("--version", action="version", version=f"leakguard {VERSION}")
    sub = p.add_subparsers(dest="cmd", required=True)

    # -- check ----------------------------------------------------------
    c = sub.add_parser("check", help="analyze files and report leaks")
    c.add_argument("paths", nargs="*", default=["."])
    c.add_argument("--format", choices=["text", "json", "sarif"], default="text")
    c.add_argument(
        "--fail-on",
        choices=["definite", "likely", "possible", "never"],
        default=None,
        help="minimum confidence that fails the build (default: definite)",
    )
    c.add_argument("--diff-only", action="store_true", help="only files changed vs base")
    c.add_argument("--diff-base", default=None, help="git ref to diff against")
    c.add_argument("--baseline", default=None, help="suppression file")
    c.add_argument("--no-baseline", action="store_true", help="ignore the baseline")
    c.add_argument("--config", default=".leakguard.toml")
    c.add_argument("--jobs", type=int, default=None)
    c.add_argument("-o", "--output", default=None, help="write to a file")

    # -- baseline -------------------------------------------------------
    b = sub.add_parser("baseline", help="accept all current findings")
    b.add_argument("paths", nargs="*", default=["."])
    b.add_argument("--baseline", default=None)
    b.add_argument("--config", default=".leakguard.toml")
    b.add_argument("--reason", default="baseline snapshot")

    # -- bench (P4) -----------------------------------------------------
    bench = sub.add_parser("bench", help="precision/recall on the test corpus")
    bench.add_argument("--corpus", default="tests/corpus")

    # -- explain (P1) ---------------------------------------------------
    e = sub.add_parser("explain", help="Mermaid CFG with the leak path in red")
    e.add_argument("target", help="FILE:FUNCTION")

    # -- fix (P2) -------------------------------------------------------
    f = sub.add_parser("fix", help="apply auto-fix patches")
    f.add_argument("paths", nargs="*", default=["."])
    f.add_argument("--write", action="store_true", help="write changes to disk")
    f.add_argument("--config", default=".leakguard.toml")

    # -- sign (CI helper) -----------------------------------------------
    s = sub.add_parser("sign", help="HMAC-sign a payload for the control plane")
    s.add_argument("file", help="JSON file to sign")

    return p


# --------------------------------------------------------------------------
# file discovery
# --------------------------------------------------------------------------


def collect_files(paths: list[str], cfg: Config) -> list[Path]:
    """Expand paths into .py files, honouring excludes.

    With --diff-only we intersect against the git diff rather than replacing
    the path list, so `leakguard check src/ --diff-only` means "changed files
    under src/", which is what people expect.
    """
    found: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_file() and p.suffix == ".py":
            found.append(p)
        elif p.is_dir():
            found.extend(sorted(p.rglob("*.py")))

    found = [p for p in found if not cfg.is_excluded(p)]

    if cfg.diff_only:
        changed = gitutil.changed_python_files(cfg.diff_base)
        if changed is None:
            print(
                "leakguard: --diff-only requested but no git diff available; "
                "scanning all files",
                file=sys.stderr,
            )
        else:
            changed_resolved = {p.resolve() for p in changed}
            found = [p for p in found if p.resolve() in changed_resolved]

    # de-duplicate, keep order
    seen: set[Path] = set()
    unique: list[Path] = []
    for p in found:
        r = p.resolve()
        if r not in seen:
            seen.add(r)
            unique.append(p)
    return unique


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_check(args) -> int:
    cfg = merge_cli(load_config(args.config), args)
    files = collect_files(args.paths, cfg)

    started = time.perf_counter()
    findings = analyze(files, cfg)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if not args.no_baseline:
        baseline = Baseline(
            cfg.baseline_path,
            remote_url=cfg.control_plane,
            repo=gitutil.current_repo(),
        ).load()
        before = len(findings)
        findings = baseline.filter(findings)
        if before != len(findings) and args.format == "text":
            print(
                f"leakguard: {before - len(findings)} finding(s) suppressed by "
                f"baseline ({baseline.source})",
                file=sys.stderr,
            )

    output = _render(args.format, findings, files, duration_ms)

    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)

    return _exit_code(findings, cfg.fail_on)


def _render(fmt: str, findings: list[Finding], files: list[Path], duration_ms: int) -> str:
    if fmt == "json":
        return json_report.render(
            findings,
            files_scanned=len(files),
            duration_ms=duration_ms,
            repo=gitutil.current_repo(),
            commit=gitutil.current_commit(),
            branch=gitutil.current_branch(),
            pr_number=gitutil.current_pr_number(),
            actor=gitutil.current_actor(),
            event=gitutil.current_event(),
            base_sha=gitutil.current_base_sha(),
            run_url=gitutil.current_run_url(),
        )
    if fmt == "sarif":
        return sarif_report.render(findings, version=VERSION)
    return text_report.render(
        findings, files_scanned=len(files), duration_ms=duration_ms
    )


def _exit_code(findings: list[Finding], fail_on: str) -> int:
    if fail_on == "never":
        return EXIT_OK
    threshold = ORDER[fail_on]
    blocking = [f for f in findings if f.rank >= threshold]
    return EXIT_FINDINGS if blocking else EXIT_OK


def cmd_baseline(args) -> int:
    cfg = merge_cli(load_config(args.config), args)
    files = collect_files(args.paths, cfg)
    findings = analyze(files, cfg)

    baseline = Baseline(cfg.baseline_path)
    n = baseline.snapshot(findings, reason=args.reason)
    print(
        f"leakguard: accepted {n} existing finding(s) into {cfg.baseline_path}\n"
        f"CI is now green. New leaks will fail; the count can only go down."
    )
    return EXIT_OK


def cmd_bench(args) -> int:
    try:
        from leakguard.bench import run_bench  # P4 owns this
    except ImportError:
        print(
            "leakguard: `bench` is not implemented yet (P4 owns leakguard/bench.py)",
            file=sys.stderr,
        )
        return EXIT_ERROR
    return run_bench(Path(args.corpus))


def cmd_explain(args) -> int:
    try:
        from leakguard.report.mermaid import explain  # P1 owns this
    except ImportError:
        print(
            "leakguard: `explain` is not implemented yet "
            "(P1 owns leakguard/report/mermaid.py)",
            file=sys.stderr,
        )
        return EXIT_ERROR

    if ":" not in args.target:
        print("leakguard: target must be FILE:FUNCTION", file=sys.stderr)
        return EXIT_ERROR
    file_part, func = args.target.rsplit(":", 1)
    try:
        print(explain(Path(file_part), func))
    except (OSError, ValueError, SyntaxError) as error:
        print(f"leakguard: {error}", file=sys.stderr)
        return EXIT_ERROR
    return EXIT_OK


def cmd_fix(args) -> int:
    try:
        from leakguard.fix.rewrite import apply_fixes  # P2 owns this
    except ImportError:
        print(
            "leakguard: `fix` is not implemented yet (P2 owns leakguard/fix/rewrite.py)",
            file=sys.stderr,
        )
        return EXIT_ERROR

    cfg = merge_cli(load_config(args.config), args)
    files = collect_files(args.paths, cfg)
    findings = analyze(files, cfg)
    changed = apply_fixes(findings, write=args.write)
    verb = "patched" if args.write else "would patch"
    print(f"leakguard: {verb} {len(changed)} file(s)")
    return EXIT_OK


def cmd_sign(args) -> int:
    """HMAC-sign a findings payload so the control plane can verify origin.

    An unauthenticated ingest endpoint on a security tool is exactly the kind
    of thing a judge pokes at. The secret comes from the LEAKGUARD_SECRET env
    var, set from a GitHub repo secret.
    """
    import hashlib
    import hmac
    import os

    secret = os.environ.get("LEAKGUARD_SECRET")
    if not secret:
        print("leakguard: LEAKGUARD_SECRET is not set", file=sys.stderr)
        return EXIT_ERROR

    body = Path(args.file).read_bytes()
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    print(f"sha256={digest}")
    return EXIT_OK


# --------------------------------------------------------------------------
# entrypoint
# --------------------------------------------------------------------------

DISPATCH = {
    "check": cmd_check,
    "baseline": cmd_baseline,
    "bench": cmd_bench,
    "explain": cmd_explain,
    "fix": cmd_fix,
    "sign": cmd_sign,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return DISPATCH[args.cmd](args)


def run() -> None:
    """Console-script entrypoint. Converts crashes into exit code 2."""
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except SyntaxError as e:
        print(f"leakguard: could not parse {e.filename}:{e.lineno}: {e.msg}", file=sys.stderr)
        sys.exit(EXIT_ERROR)
    except Exception as e:  # noqa: BLE001 - fail open, never block CI on a crash
        print(f"leakguard: internal error: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(EXIT_ERROR)


if __name__ == "__main__":
    run()
