# LeakGuard status and demo handoff

## Shipping status

| Area | State |
|---|---|
| Python AST parser, IR and CFG | Complete |
| Path-sensitive dataflow and confidence | Complete |
| Early return, exception, loop and reassignment cases | Complete |
| Text, JSON and SARIF reports | Complete |
| CLI build-gating exit codes | Complete |
| Baseline ratchet | Complete |
| Pre-commit hook | Verified blocking a real commit |
| Composite GitHub Action | Verified in GitHub Actions |
| `bench`, `explain`, verified `fix` | Complete |
| VS Code diagnostics and quick-fix | Compiled and unit tested |
| Dashboard and local report APIs | Production build and CI verified |
| Realistic demo repository | 10 seeded findings + safe examples |
| Optional n8n/Postgres history | Local assets complete; deployment optional |

## Measured evidence

The labelled corpus contains 10 leaky and 15 safe Python files:

```text
TP 10  FN 0
FP  0  TN 15
precision 1.00  recall 1.00  F1 1.00
```

These numbers describe the checked corpus only; they are not a claim of
universal accuracy. See `docs/04-limitations.md` for ownership and dynamic-call
boundaries.

## Five-minute demo

```bash
pytest -q
leakguard bench
leakguard check demo-repo/app --no-baseline --fail-on likely
leakguard explain demo-repo/app/storage.py:find_customer
leakguard fix demo-repo/app/storage.py
leakguard check demo-repo/app --format json --fail-on never --no-baseline -o leakguard.json
cd dashboard && npm run dev
```

The strict demo scan intentionally exits `1`. Show the witness path, preview a
verified fix, then open the dashboard and use **Scan now** to refresh the same
report. The dashboard visibly distinguishes live report data from fallback
fixtures and labels non-live history.

## Trigger points

- VS Code scans Python files on open/save and exposes a manual scan command.
- pre-commit scans staged Python files when `git commit` runs after installation.
- GitHub Actions scans on pull requests and configured branch pushes.
- The dashboard scans only when **Scan now** is pressed; otherwise it reads the
  latest `leakguard.json` and never executes arbitrary user-provided paths.

## Before judging

1. Generate `leakguard.json` from `demo-repo/app`.
2. Start the dashboard and confirm the repository/source badge says live.
3. Open the VS Code Extension Development Host and save a seeded Python file.
4. Keep one PR with a required failing LeakGuard check for the blocked-merge demo.
5. Tag a release and replace mutable `nikita` references in demo integration files.
