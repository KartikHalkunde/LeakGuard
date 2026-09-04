"""CLI contract tests - P3.

The exit codes are what CI depends on. If these break, the pre-commit hook
and the GitHub Action silently stop blocking anything, so treat them as the
most important tests in the repo.
"""

from __future__ import annotations

import json

import pytest

from leakguard.cli import EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, main
from leakguard.core.finding import Confidence, Finding

STUB = "# LEAKGUARD_STUB_LEAK"


@pytest.fixture
def leaky(tmp_path):
    p = tmp_path / "leaky.py"
    p.write_text(
        f"import sqlite3\n\n\ndef f():\n    conn = sqlite3.connect('db')  {STUB}\n"
        "    return None\n",
        encoding="utf-8",
    )
    return p


@pytest.fixture
def clean(tmp_path):
    p = tmp_path / "clean.py"
    p.write_text("def f(path):\n    with open(path) as fh:\n        return fh.read()\n",
                 encoding="utf-8")
    return p


# -- exit codes ------------------------------------------------------------


def test_clean_file_exits_zero(clean):
    assert main(["check", str(clean), "--no-baseline"]) == EXIT_OK


def test_finding_exits_one(leaky):
    assert main(["check", str(leaky), "--no-baseline"]) == EXIT_FINDINGS


def test_fail_on_never_always_passes(leaky):
    assert main(["check", str(leaky), "--fail-on", "never", "--no-baseline"]) == EXIT_OK


def test_threshold_respected(leaky, monkeypatch):
    """A LIKELY finding must not fail a build set to --fail-on=definite."""
    import leakguard.cli as cli

    def only_likely(paths, cfg):
        return [
            Finding(
                confidence=Confidence.LIKELY,
                resource="builtins.file",
                file="x.py",
                function="f",
                variable="fh",
                acquired_line=1,
            )
        ]

    monkeypatch.setattr(cli, "analyze", only_likely)
    assert main(["check", str(leaky), "--fail-on", "definite", "--no-baseline"]) == EXIT_OK
    assert main(["check", str(leaky), "--fail-on", "likely", "--no-baseline"]) == EXIT_FINDINGS


# -- output formats --------------------------------------------------------


def test_json_is_valid_and_has_summary(leaky, capsys):
    main(["check", str(leaky), "--format", "json", "--fail-on", "never", "--no-baseline"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["version"] == "1.0"
    assert payload["summary"]["total"] == 1
    assert payload["findings"][0]["fingerprint"]


def test_sarif_is_valid(leaky, capsys):
    main(["check", str(leaky), "--format", "sarif", "--fail-on", "never", "--no-baseline"])
    doc = json.loads(capsys.readouterr().out)
    assert doc["version"] == "2.1.0"
    assert doc["runs"][0]["tool"]["driver"]["name"] == "LeakGuard"
    assert doc["runs"][0]["results"][0]["level"] == "error"


def test_output_to_file(leaky, tmp_path):
    out = tmp_path / "r.sarif"
    main(["check", str(leaky), "--format", "sarif", "--fail-on", "never",
          "--no-baseline", "--output", str(out)])
    assert json.loads(out.read_text())["version"] == "2.1.0"


# -- discovery -------------------------------------------------------------


def test_directory_scan_finds_nested(tmp_path):
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "a.py").write_text(f"x = 1  {STUB}\n", encoding="utf-8")
    assert main(["check", str(tmp_path), "--no-baseline"]) == EXIT_FINDINGS


def test_excluded_dirs_skipped(tmp_path):
    venv = tmp_path / ".venv"
    venv.mkdir()
    (venv / "bad.py").write_text(f"x = 1  {STUB}\n", encoding="utf-8")
    assert main(["check", str(tmp_path), "--no-baseline"]) == EXIT_OK


# -- crash safety ----------------------------------------------------------


def test_missing_path_does_not_crash():
    assert main(["check", "does/not/exist.py", "--no-baseline"]) == EXIT_OK


def test_unimplemented_subcommands_exit_two():
    """Delegated commands must report cleanly, not traceback."""
    assert main(["bench"]) == EXIT_ERROR
    assert main(["explain", "a.py:f"]) == EXIT_ERROR
