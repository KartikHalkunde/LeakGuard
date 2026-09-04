# Acme Reports — LeakGuard demo repository

This deliberately vulnerable Python service looks like a small production app:
it reads uploads, queries SQLite, exports reports, calls a TCP service, and runs
subprocess jobs. Ten resource leaks are seeded across realistic control-flow
paths; `app/safe_examples.py` contains suspicious-looking code that must stay
quiet.

## Run the demo

From the LeakGuard repository root:

```bash
leakguard check demo-repo/app --no-baseline --fail-on likely
leakguard check demo-repo/app --format sarif --fail-on never -o leakguard.sarif
leakguard fix demo-repo/app/exporter.py
```

The first command must exit `1`, print file/line/resource/reason/witness paths,
and therefore block pre-commit or CI. The fix command previews a verified patch;
add `--write` only on a disposable demo branch.

Expected result: **10 findings** and no finding from `safe_examples.py`.
`possible` ownership escapes remain advisory.

## Exactly when scanning runs

| Surface | Trigger | What happens |
|---|---|---|
| CLI | You run `leakguard check ...` | Scans immediately and returns exit `1` at the configured confidence threshold. |
| VS Code | A Python file is opened or saved | Runs the same analyzer for that file; can also run `LeakGuard: Scan current file`. |
| pre-commit | `git commit` after `pre-commit install` | Scans staged Python filenames and blocks the commit on findings. |
| GitHub Action | Pull request opened/updated, or push to `main` | Scans `app`, uploads SARIF, and fails the required check. |
| Dashboard | It does **not** scan source code itself | Reads the latest `leakguard.json`; regenerate that report after code changes. |

Refresh the dashboard report from the parent LeakGuard repository:

```bash
leakguard check demo-repo/app --format json --fail-on never --no-baseline -o leakguard.json
```

This separation is deliberate: the analyzer remains offline and deterministic;
the dashboard only visualizes its machine-readable result.

## Use as a standalone repository

Copy this directory into its own Git repository, then run:

```bash
pre-commit install
pre-commit run --all-files
```

Protect `main` and require the `LeakGuard / scan` check to demonstrate a real
blocked merge.
