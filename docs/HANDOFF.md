# Status and Handoff

Everything below is **already in the repo on branch `P3`**. Nobody needs files
emailed around — they need to merge.

```bash
git fetch origin
git merge origin/P3        # or: git rebase origin/P3
```

---

## Where the project stands

| Area | State |
|---|---|
| Analyzer engine (parse → CFG → dataflow → findings) | ✅ **live end to end** |
| `pipeline.py` (the file-level orchestrator) | ✅ added — the stub path is off |
| CLI, exit-code contract | ✅ done |
| Pre-commit hook | ✅ verified blocking a real commit |
| GitHub Action + SARIF | ✅ done |
| Baseline ratchet | ✅ verified: existing green, new red |
| Resource catalogue (25 types) | ✅ done |
| Test corpus (25 files) | ✅ P4 |
| n8n control plane | 🔨 in progress |
| `leakguard bench` command | ❌ not built |
| VS Code extension | ❌ not built |
| Dashboard | ❌ not built |
| Auto-fix (`fix/rewrite.py`) | ⚠️ exists, unverified |

### Measured on P4's 25-file corpus

| Threshold | TP | FP | FN | TN | Precision | Recall |
|---|---|---|---|---|---|---|
| **`--fail-on=definite`** ← ship default | 4 | **0** | 6 | 15 | **1.00** | 0.40 |
| `--fail-on=likely` | 9 | 5 | 1 | 10 | 0.64 | 0.90 |

**Zero false positives at the shipping default.** That is the headline number:
the tool never cries wolf where it blocks a build. Every false positive is
`likely`, which warns rather than fails.

Be honest about the other half — at `definite` it blocks on only 4 of 10 real
leaks. *"We tuned for zero false blocks, and here is the dial"* is a far
stronger answer than pretending recall is perfect.

---

## P1 (parser) — what changed for you

**Read:** [`docs/P1-PARSER.md`](P1-PARSER.md)

1. `leakguard/core/pipeline.py` now exists and calls your `build_cfg` per
   function. You don't need to write file-walking code.
2. Functions are keyed by **qualified name** (`Class.method`) so two same-named
   methods in one module don't collide in the summary table.
3. **Still open — `report/mermaid.py`.** `leakguard explain FILE:FUNC` is wired
   in `cli.py` and currently prints "not implemented". This is the best visual
   in the project and no other team can produce it. It's your highest-value
   remaining task.

---

## P2 (analysis) — bug list, in priority order

**Read:** [`docs/P2-ANALYSIS.md`](P2-ANALYSIS.md)

Five false positives, all missing guardrail rungs. Fixing them moves precision
at `--fail-on=likely` from 0.64 toward 0.90+.

| Corpus file | Missing guardrail |
|---|---|
| `safe/03_try_finally` | close inside `finally` not recognised (rung 3) |
| `safe/07_alias_close` | alias tracking — `b = a; b.close()` (rung 5) |
| `safe/11_both_branches` | join at merge: closed on **both** branches should be `CLOSED`, not `MAYBE_OPEN` |
| `safe/13_loop_open_close` | open + close inside the same loop body |
| `safe/14_reassign_after_close` | reassign after a close |

One false negative:

| `leaky/04_only_in_except` | closed only on the error path; the happy path leaks and is currently missed |

### Two reporting bugs — fix before the demo

Given the textbook early-return case:

```python
conn = sqlite3.connect("db")
if flag:
    return None          # <- the leak a judge will point at
conn.close()
```

the tool currently reports:

```
path     4 (exception)
close    line 7   unreachable from line 1
```

1. **`check_exits` prefers the exception exit over the return exit.** A judge
   writing the classic early-return example sees "exception path" and concludes
   we missed the obvious thing. Prefer a `return` exit when both leak.
2. **`close_unreachable_from` is emitting a block id, not a line number.**
   "line 1" above is block 1.

### Contract note

`core/finding.py` is the merged version. It keeps your `to_dict()` and frozen
`PathStep`, and adds `rank` + `sort_findings` that `cli.py` needs. Fingerprints
are byte-identical to your branch's, so nothing built on them is invalidated.

---

## P4 (interface) — what's ready for you

**Read:** [`docs/P4-INTERFACE.md`](P4-INTERFACE.md)

1. **`leakguard bench` is still unbuilt** and `cli.py` already delegates to
   `leakguard/bench.py` → `run_bench(corpus_path)`. Just create that module.
   The numbers in the table above came from a throwaway script; make it a real
   command so it regenerates live on stage.
2. **JSON schema is frozen** — see `leakguard/report/json.py`. Your dashboard
   and the VS Code extension both parse it.
3. **`integrations/n8n/sample-payload.json`** is 10 real findings with CI
   context. Build the dashboard against it without waiting for the control
   plane.
4. Dashboard data endpoints land at `…/webhook/leakguard/api/{findings,trend,fp-rate}`.

---

## P3 (platform) — remaining

1. Deploy n8n + Postgres, run `schema.sql`
2. Workflows 1–4 (see [`integrations/n8n/README.md`](../integrations/n8n/README.md))
3. Wire `control_plane` into `.leakguard.toml`
4. Set up a `cloudflared` tunnel as demo-day fallback

---

## Everyone: two loose ends

**Branch naming is inconsistent** — `P3`, `P4`, `p2`, `nikita`. Organisers are
watching the repo. Worth standardising, or at least being able to explain it.

**Nobody has merged into `main` yet.** `main` still holds only the README. All
four branches should land there well before the freeze, not in the last hour —
a repo whose `main` is empty until hour 29 looks bad regardless of the code.
