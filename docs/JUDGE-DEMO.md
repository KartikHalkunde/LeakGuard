# LeakGuard judge demo runbook

## Before recording

```bash
source .venv/Scripts/activate
pytest -q
cd integrations/vscode && npm test && cd ../..
cd dashboard && npm test && cd ..
```

Keep two terminals ready. Start the dashboard in terminal one with
`cd dashboard && npm run dev`. In terminal two, stay at the repository root.

## Five-minute recording sequence

1. **Problem (20 seconds):** explain that resource leaks survive ordinary tests
   because they fail slowly in production.
2. **AST proof (40 seconds):** run
   `leakguard check demo-repo/app --no-baseline --fail-on likely`. Point to the
   acquisition line, witness path, unreachable close and non-zero exit.
3. **Verified fix (40 seconds):** run
   `leakguard fix demo-repo/app/storage.py` without `--write` to preview the
   patch. Explain that writes are re-analyzed before being accepted.
4. **Developer feedback (45 seconds):** open `integrations/vscode` in VS Code,
   press F5, open a seeded Python file in the Extension Development Host and
   save it. Show the red diagnostic, Problems entry and lightbulb quick-fix.
5. **Dashboard (60 seconds):** open `http://localhost:3000`, press **Scan now**,
   and show `Scanned 8 files · found 10 leaks`, live history, finding details,
   measured FP/FN matrix and CFG.
6. **Real enforcement (45 seconds):** show GitHub Actions. Normal CI is green;
   Demo Leak Gate is red because it intentionally scans the seeded leaks.
7. **Accuracy and limits (30 seconds):** show `docs/03-benchmark.md` and
   `docs/04-limitations.md`. State that 100% is measured only on the labelled
   corpus, not claimed universally.

## VS Code visual acceptance checklist

- Extension Development Host starts with F5.
- Opening and saving a leaky `.py` file produces diagnostics.
- Definite is red; likely is yellow; possible is informational.
- Diagnostic includes resource type, acquisition line and witness path.
- `LeakGuard: Scan Current File` works from the command palette.
- The lightbulb fix changes the file only after analyzer verification.
- Saving a safe context-manager example clears diagnostics.

The visual steps require an interactive VS Code window; compile and unit tests
remain the automated CI gate.

## Submission checklist

- Use branch `nikita` or merge it into `main`.
- Link the green **CI** run and the intentionally-red **Demo Leak Gate** run.
- Include the dashboard screenshot after a completed scan.
- Include the VS Code Problems-panel screenshot.
- Record a backup video following this exact runbook.
- Do not include `.env`, `.venv`, `.next`, `node_modules` or generated reports.
