# P4 — Interface Engineer

**You own:** `tests/corpus/`, `tests/test_corpus.py`, the `bench` command, `demo-repo/`, `integrations/vscode/`, the Next.js dashboard, `docs/`

**Phase 1 you write the specification. Phases 2–3 you build the surfaces people see.**

---

## Why you start on the corpus, not the frontend

There is nothing to display until hour ~10. So Phase 1 is the **test corpus** — ~50 labelled Python files that define what "correct" means. That corpus *is* the spec P1 and P2 build against, and it's what makes your false-positive numbers real instead of retrofitted at hour 29.

**Your corpus is the most important thing anyone ships in Phase 1.** Write the traps a judge will write.

---

## Task 1 — The corpus (hours 2–8)

### File format

Each file declares its expected verdicts in a header. The harness parses these.

```python
# EXPECT: LEAK var=conn line=5 confidence=definite
import sqlite3

def fetch(user_id):
    conn = sqlite3.connect("app.db")
    return None
```

```python
# EXPECT: CLEAN
def read(path):
    with open(path) as f:
        return f.read()
```

Directive grammar:

```
# EXPECT: CLEAN
# EXPECT: LEAK var=<name> line=<n> confidence=definite|likely|possible
```

Multiple `LEAK` lines allowed. One file per scenario — small and focused, not one giant file.

### `corpus/safe/` — MUST NOT be flagged

These are your false-positive tests. **This directory is where the grade is.**

| File | Pattern |
|---|---|
| `01_with_statement.py` | `with open(p) as f:` |
| `02_closing_wrapper.py` | `with contextlib.closing(urlopen(u)):` |
| `03_try_finally.py` | close in `finally` |
| `04_return_escapes.py` | `def get(): return sqlite3.connect(db)` |
| `05_self_attribute.py` | `self.conn = sqlite3.connect(db)` |
| `06_container_escape.py` | `conns.append(sqlite3.connect(db))` |
| `07_alias_close.py` | `a = open(p); b = a; b.close()` |
| `08_exit_stack.py` | `stack.enter_context(open(p))` |
| `09_helper_returns.py` | `c = get_conn()` where the helper returns one |
| `10_helper_closes.py` | `cleanup(c)` where the helper closes it |
| `11_both_branches.py` | closed on `if` and on `else` |
| `12_nested_with.py` | two `with` items on one line |
| `13_loop_open_close.py` | opened and closed inside the same loop body |
| `14_reassign_after_close.py` | `f.close(); f = open(q); f.close()` |
| `15_yield_escape.py` | generator yields the resource |

### `corpus/leaky/` — MUST be flagged

| File | Pattern |
|---|---|
| `01_early_return.py` | `close()` exists but the early return skips it |
| `02_loop_leak.py` | opened N times in a loop, closed once after |
| `03_exception_path.py` | `risky()` between open and close (expect `likely`) |
| `04_only_in_except.py` | closed only on the error path; happy path leaks |
| `05_overwritten.py` | `f = open(a); f = open(b); f.close()` — first handle lost |
| `06_decoy_with.py` | ⚠️ **the trap** — a `with` block present, but a *different* resource leaks |
| `07_conditional_close.py` | closed only inside `if verbose:` |
| `08_nested_early_return.py` | return inside a nested `if` inside a loop |
| `09_break_before_close.py` | `break` skips the close |
| `10_multi_resource.py` | two resources, one closed, one not |

**`06_decoy_with.py` is the file a judge will write.** Make sure it passes:

```python
# EXPECT: LEAK var=conn line=5 confidence=likely
def export(path, db):
    conn = sqlite3.connect(db)
    with open(path) as fh:          # decoy — this one IS safe
        return fh.read()            # conn never closed
```

---

## Task 2 — `tests/test_corpus.py` (hours 8–10)

```python
import re, pytest
from pathlib import Path
from leakguard import analyze

DIRECTIVE = re.compile(
    r"#\s*EXPECT:\s*(CLEAN|LEAK)(?:\s+var=(\S+))?"
    r"(?:\s+line=(\d+))?(?:\s+confidence=(\w+))?")

def expectations(path: Path):
    out = []
    for line in path.read_text().splitlines():
        m = DIRECTIVE.match(line.strip())
        if m:
            kind, var, line_no, conf = m.groups()
            if kind == "CLEAN":
                return []
            out.append({"var": var, "line": int(line_no) if line_no else None,
                        "confidence": conf})
    return out

@pytest.mark.parametrize("path", sorted(Path("tests/corpus").rglob("*.py")))
def test_corpus_file(path):
    expected = expectations(path)
    actual = analyze([path])
    assert len(actual) == len(expected), \
        f"{path}: expected {len(expected)} findings, got {len(actual)}"
    for exp, act in zip(expected, actual):
        if exp["var"]:        assert act.variable == exp["var"]
        if exp["confidence"]: assert act.confidence.value == exp["confidence"]
```

Run it from hour 8 onward. **Most of it fails at first — that's the point.** It's the target P1 and P2 aim at. Report failures to them daily; you're their feedback loop.

---

## Task 3 — `leakguard bench` (hours 10–11)

The single most credible slide in your deck: real numbers, generated live.

```python
def bench():
    tp = fp = tn = fn = 0
    for path in Path("tests/corpus").rglob("*.py"):
        expected = expectations(path)
        actual   = analyze([path])
        is_leaky, flagged = bool(expected), bool(actual)
        if   is_leaky and flagged:         tp += 1
        elif is_leaky and not flagged:     fn += 1
        elif not is_leaky and flagged:     fp += 1
        else:                              tn += 1

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall    = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    print(f"""
              flagged   clean
    leaky      TP {tp:3d}   FN {fn:3d}
    safe       FP {fp:3d}   TN {tn:3d}

    precision {precision:.2f}   recall {recall:.2f}   F1 {f1:.2f}
""")
```

Write the output to `docs/03-benchmark.md` on every run so the doc is never stale.

**Report the real numbers, including the failures.** The problem statement explicitly rewards this. A documented FP is more credible than a hidden one.

---

## Task 4 — `demo-repo/` (hours 11–14)

A small, *plausible* Python app — not obviously a test fixture. Something like a Flask API with a DB layer, a file exporter, and a socket client.

- 5–10 seeded leaks across different shapes (early return, exception path, loop, conditional)
- Several safe-but-suspicious functions so the demo shows *silence* too
- Its own `.pre-commit-config.yaml` and `.github/workflows/leakguard.yml`
- **Branch protection requiring the LeakGuard check** (coordinate with P3)
- A prepared PR branch with one seeded leak, ready to open live

Also seed a `legacy/` directory with ~30 pre-existing leaks so you can demo `leakguard baseline` turning a red repo green.

---

## Task 5 — VS Code extension (hours 18–24)

**Do not build a Language Server.** ~120 lines of TypeScript. The CLI already emits JSON, so this is a thin client.

`integrations/vscode/package.json`:

```json
{
  "name": "leakguard",
  "displayName": "LeakGuard",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Linters"],
  "activationEvents": ["onLanguage:python"],
  "main": "./out/extension.js",
  "contributes": {
    "configuration": {
      "properties": {
        "leakguard.path":   { "type": "string", "default": "leakguard" },
        "leakguard.failOn": { "type": "string", "default": "likely" }
      }
    }
  }
}
```

`src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { execFile } from 'child_process';

const diagnostics = vscode.languages.createDiagnosticCollection('leakguard');

const LEVEL: Record<string, vscode.DiagnosticSeverity> = {
  definite: vscode.DiagnosticSeverity.Error,
  likely:   vscode.DiagnosticSeverity.Warning,
  possible: vscode.DiagnosticSeverity.Information,
};

function scan(doc: vscode.TextDocument) {
  if (doc.languageId !== 'python') return;
  const bin = vscode.workspace.getConfiguration('leakguard').get<string>('path', 'leakguard');

  execFile(bin, ['check', doc.fileName, '--format', 'json'], (_err, stdout) => {
    if (!stdout) return;
    let report: any;
    try { report = JSON.parse(stdout); } catch { return; }

    diagnostics.set(doc.uri, (report.findings ?? []).map((f: any) => {
      const line = Math.max(f.acquired_at.line - 1, 0);
      const range = doc.lineAt(line).range;
      const d = new vscode.Diagnostic(range, f.reason, LEVEL[f.confidence]);
      d.source = 'LeakGuard';
      d.code = f.fingerprint;
      d.relatedInformation = (f.leak_path ?? []).map((s: any) =>
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(doc.uri, doc.lineAt(Math.max(s.line - 1, 0)).range),
          s.note));
      return d;
    }));
  });
}

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidSaveTextDocument(scan),
    vscode.workspace.onDidOpenTextDocument(scan),
    vscode.languages.registerCodeActionsProvider('python', new FixProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );
  vscode.workspace.textDocuments.forEach(scan);
}
```

`relatedInformation` is the detail worth having — VS Code renders the **witness path** as clickable steps in the Problems panel. That's the same counterexample the CLI prints, inside the editor.

### The quick-fix — calls P2's module, writes nothing itself

```typescript
class FixProvider implements vscode.CodeActionProvider {
  provideCodeActions(doc: vscode.TextDocument, _r: vscode.Range,
                     ctx: vscode.CodeActionContext) {
    return ctx.diagnostics
      .filter(d => d.source === 'LeakGuard')
      .map(d => {
        const a = new vscode.CodeAction('Wrap in with-statement',
                                        vscode.CodeActionKind.QuickFix);
        a.command = { command: 'leakguard.fix', title: 'Fix',
                      arguments: [doc.uri, d.code] };
        a.diagnostics = [d];
        return a;
      });
  }
}
```

The `leakguard.fix` command shells out to `leakguard fix --write`, which calls **P2's `fix/rewrite.py`**. Two stretch goals for barely more than one's work.

Run with F5 in the Extension Development Host. **Do not attempt to publish to the marketplace** — a sideloaded demo is fine and publishing burns hours on review.

---

## Task 6 — Dashboard (hours 14–16 scaffold, 24–26 charts)

Next.js App Router + Tailwind + Recharts, on Vercel. Reuse the Axon frontend shell — layout, theme, auth pattern, chart wrappers. That's hours you skip.

Four screens, in priority order:

| Screen | Shows | Why |
|---|---|---|
| **Leak debt over time** | line chart, total open findings since baseline | the "why we keep it on" chart |
| **Findings table** | file · resource · confidence · witness path expander | the working view |
| **FP rate trend** | measured FP rate declining as triage accumulates | proves the loop works |
| **CFG view** | P1's Mermaid, leak path in red | **the money shot** |

Mermaid renders client-side with `mermaid.initialize()` — no server work.

Data comes from the dashboard's in-repo control-plane APIs. **Build against P2's JSON fixtures from hour 14** so interface work never waits on deployment.

**Cut order if behind:** FP-rate trend → findings table → leak debt. **Protect the CFG view** — it's the one visual no competing team can produce.

---

## Task 7 — Docs and slides (hours 26–30)

You assemble; each person writes their own section.

| Doc | Owner |
|---|---|
| `00-problem-analysis.md` | you |
| `01-architecture.md` | P1 |
| `02-decision-log.md` | everyone, continuously |
| `03-benchmark.md` | you, generated by `bench` |
| `04-limitations.md` | P2 |
| `05-comparison.md` | P3 |
| `demo-script.md` | you |

**Nag everyone to write decision-log entries as they go.** At finals you'll be asked *"why did you do X?"*, and a timestamped answer from hour 9 is what separates a project from a prototype.

---

## Your schedule

| Hours | Task |
|---|---|
| 0–2 | Contracts with the team |
| 2–5 | `corpus/safe/` — 15 files |
| 5–8 | `corpus/leaky/` — 10 files, including the decoy trap |
| 8–10 | `test_corpus.py` harness |
| 10–11 | `leakguard bench` |
| 11–14 | `demo-repo/` + `legacy/` + prepared PR branch |
| 14–16 | Next.js scaffold on Vercel, mock data |
| 16–18 | Feed corpus failures to P1/P2 — you're their feedback loop |
| 18–21 | **VS Code extension** — diagnostics + squiggles |
| 21–24 | VS Code quick-fix wired to P2's `fix/rewrite.py` |
| 24–26 | Dashboard charts on real data |
| 26–28 | `docs/` assembly · final benchmark numbers |
| 28–30 | Slides · rehearse · **backup video** |

---

## Read before hour 0

- README's corpus section
- Precision / recall / F1 — you'll be asked to explain the numbers
- **The problem statement, twice.** You own the narrative; you should know it better than anyone.

**Demo segments you own:** the opening — problem framing and why AST-walking fails — and `leakguard bench` with the real confusion matrix. You open and you close. Rehearse both.
