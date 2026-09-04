# LeakGuard — Team Split

Four people, four stacks, four phases. Everyone codes from hour 2 onward. Nobody waits.

---

## The four roles

| | Role | Stack | Owns |
|---|---|---|---|
| **P1** | **Parser Engineer** | Python · `ast` · graphs | `core/parse.py`, `core/ir.py`, `core/cfg.py`, `cli.py` |
| **P2** | **Analysis Engineer** | Python · dataflow algorithms | `core/dataflow.py`, `core/escape.py`, `core/confidence.py`, `core/finding.py`, `fix/rewrite.py`, `report/*` |
| **P3** | **Platform Engineer** | **n8n** · GitHub Actions · Postgres | `integrations/action/`, `integrations/pre-commit/`, `report/sarif.py`, all n8n workflows, DB schema |
| **P4** | **Interface Engineer** | **Next.js** · TypeScript · VS Code API | `tests/corpus/`, dashboard, VS Code extension, `docs/` |

**P1 is the critical path.** Give it to whoever is strongest on graphs and recursion. Everything else degrades gracefully; a missing CFG kills the project.

### Why P4 starts on the test corpus, not the frontend

There is nothing to display until hour ~10. So P4 spends Phase 1 writing the **test corpus** — the ~50 labelled Python files that define what "correct" means. That corpus *is* the specification P1 and P2 build against, and it's what makes your false-positive numbers real instead of retrofitted at hour 29. By the time P4 switches to Next.js, real findings exist to render.

Same logic for P3: the n8n control plane has nothing to ingest until findings exist, so Phase 1 is the CI plumbing (hook + Action), Phase 2–3 is n8n.

---

## The handshake rule — read this before hour 2

> **At hour 2, every person ships a fake to whoever depends on them.**

| From → To | Ships | Buys |
|---|---|---|
| **P1 → P2** | 3 hand-written `CFG` objects as Python fixtures (no parser needed) | P2 builds dataflow for 10 hours without P1 finishing |
| **P2 → P3/P4** | 5 `Finding` objects dumped as JSON | P3 builds SARIF + n8n, P4 builds the dashboard, both against real-shaped data |
| **P3 → all** | `analyze()` stub returning hardcoded findings | The full CLI → hook → Action pipeline is testable at hour 4 |
| **P4 → P1/P2** | Corpus files with expected verdicts | The engine has a target from hour 2 |

Each fake costs ~30 minutes and buys ten hours of parallelism. **Do not skip this.** Integration later is just deleting fakes.

---

# The phase matrix

## PHASE 1 — Foundations (hours 0–8)

**Goal: a real commit gets blocked by hour 8.** The engine inside is fake. The plumbing is real and never gets touched again.

### Hours 0–2 — all four in one room, no code

Agree and commit to `main` before anyone branches:

1. **IR dataclasses** — `Acquire`, `Release`, `Escape`, `Scoped`, `Alias`, `CallSite` (README Step 1)
2. **CFG types** — `BasicBlock`, `Edge`, `CFG` (Step 2)
3. **`Finding` dataclass + JSON schema** (Step 8)
4. Repo scaffold, `pyproject.toml`, branch protection, CI running `pytest`

**These are frozen for the event.** Changing a contract at hour 15 costs you the project.

### Hours 2–8

| | **P1 — Parser** | **P2 — Analysis** | **P3 — Platform** | **P4 — Interface** |
|---|---|---|---|---|
| **2–4** | Hand-write 3 CFG fixtures → push · start `parse.py` | `Finding` + `fingerprint()` · dump JSON fixtures → push | `analyze()` stub · CLI skeleton · exit codes 0/1/2 | 10 `corpus/safe/` files |
| **4–6** | Basic-block splitting, straight-line code | Lattice + join table + `transfer()`, tested on P1's fixtures | **pre-commit hook working** | 10 `corpus/leaky/` files |
| **6–8** | `if`/`elif`/`else` + join blocks | Worklist fixpoint loop | **GitHub Action working, red ❌ on a PR** | Expected-verdict annotations · `test_corpus.py` |

**✅ Exit check:** `git commit` on a seeded file is blocked. A PR shows a red ❌. Engine is fake — that's fine.

---

## PHASE 2 — Core engine + platform (hours 8–18)

**Goal: the fakes come out.** This phase is the project.

| | **P1 — Parser** | **P2 — Analysis** | **P3 — Platform** | **P4 — Interface** |
|---|---|---|---|---|
| **8–11** | Loops: `while`, `for`, `break`, `continue`, back-edges | Exit check + BFS witness-path reconstruction | `report/sarif.py` + `upload-sarif` in the Action | `leakguard bench` → confusion matrix |
| **11–14** | **`try`/`except`/`finally` + exception edges** ← hardest thing in the project | **Escape analysis** ← biggest FP win, ~60 lines | **n8n: `ingest-findings`** · Postgres schema | `demo-repo/` with 5–10 seeded leaks |
| **14–16** | `with` → `Scoped` events · alias tracking | Confidence scoring · `report/text.py`, `report/json.py` | **n8n: `pr-comment`** with witness path | Next.js scaffold on Vercel, mock data |
| **16–18** | **🔗 Wire real CFG to real dataflow. Run the corpus. Fix what breaks.** | | Branch protection on demo-repo | Feed corpus failures to P1/P2 |

### 🚦 HOUR 18 — GO/NO-GO GATE

Everyone stops. Run `leakguard bench`. One question:

> **Does the engine correctly handle early returns, exception paths, and escape analysis?**

- **YES** → Phase 3 as planned.
- **NO** → **P3 drops n8n. P4 drops the dashboard and the VS Code extension. Both join the engine.** Ship a correct CLI + hook + Action and nothing else.

A polished control plane around a broken analyzer loses to a plain CLI that is actually correct. Write this gate into `docs/02-decision-log.md` in hour 1, while everyone is calm — it is much harder to make the call at hour 18 on no sleep.

---

## PHASE 3 — Differentiators (hours 18–26)

**Only if the gate passed.** Everything here is upside.

| | **P1 — Parser** | **P2 — Analysis** | **P3 — Platform** | **P4 — Interface** |
|---|---|---|---|---|
| **18–21** | Harden CFG against corpus failures · expose graph data | Interprocedural summaries (`returns_resource`, `closes_arg`) | **n8n: `triage-callback` + shared baseline** ← the novelty | **VS Code extension**: diagnostics + squiggles |
| **21–24** | `report/mermaid.py` — CFG with leak path in red | `fix/rewrite.py` — the two safe transformations | **n8n: `slack-alert`, `weekly-digest`** | VS Code quick-fix wired to `fix/rewrite.py` |
| **24–26** | Bug-fixing from corpus | Patch verification loop (re-run analyzer, discard if not clean) | **n8n: `fix-bot`** (LLM drafts → analyzer verifies → PR) | Dashboard: leak-debt chart, FP-rate chart, findings table |

### Cut order if you fall behind — sacrifice bottom-up

1. `fix-bot` PR automation *(keep plain `leakguard fix --write`)*
2. Dashboard charts *(n8n can post to Slack instead)*
3. VS Code extension *(painful, but it's a stretch goal)*
4. Mermaid CFG viz ← **protect this.** Best visual you have, and no other team can produce it.

### Two efficiency notes

- **Auto-fix and the VS Code quick-fix are one feature.** P2's `fix/rewrite.py` powers `leakguard fix --write`, the 💡 lightbulb in the editor, and P3's n8n PR bot. Two stretch goals for barely more than one's work — P4 and P3 both just call P2's module.
- **Confidence scoring is free.** It falls out of P2's exit check. Zero extra work for a listed stretch goal.

---

## PHASE 4 — Freeze and ship (hours 26–30)

**Hour 26 is a hard feature freeze.** Every hackathon that dies, dies here — someone starts "one more quick feature" at hour 27 and breaks the demo.

| | All four |
|---|---|
| **26–27** | Bug-fix only. Full corpus green. Final `leakguard bench` numbers → `docs/03-benchmark.md`. Each person writes their own lane's section of `docs/`. |
| **27–28** | **Record the backup demo video.** Do this before you're too tired to do it cleanly. |
| **28–29** | Slides — P4 assembles, everyone reviews their own section. |
| **29–30** | Rehearse end to end, twice, timed. |

### Demo speaking roles

| Segment | Who | Why |
|---|---|---|
| Problem framing · why AST-walking fails | P4 | Owns the narrative |
| Live catch: early return + exception path | P1 | Owns the CFG, can answer "how" |
| **Hand the judge a keyboard** — invite them to break it | P2 | Owns the guardrails, can explain any verdict live |
| PR blocked · VS Code quick-fix | P3 + P4 | Own those surfaces |
| `leakguard bench` — real precision/recall | P4 | Owns the evidence |
| Triage loop · baseline ratchet · n8n | P3 | Owns the control plane |
| Limitations, honestly | P2 | Credibility comes from the person who knows the edges |

Rehearse the keyboard hand-off. Nobody else will risk it, and it's the single most convincing thing you can do — it proves the CFG is real.

---

# Individual briefs

## P1 — Parser Engineer

**You are the critical path.** Two people's work depends on your output shape, so ship the fixtures early and keep the IR stable.

| Phase | Deliverable |
|---|---|
| 1 | 3 hand-written CFG fixtures · `parse.py` · basic blocks · `if`/`else` + join blocks |
| 2 | Loops + back-edges · **`try`/`except`/`finally` with exception edges** · `with` → `Scoped` · aliasing |
| 3 | `report/mermaid.py` — the CFG diagram · corpus hardening |
| 4 | Bug-fix · your section of `docs/01-architecture.md` |

**Hardest thing you'll do:** exception edges. Rule — emit them from every `CallSite` where `may_raise`, routed to the innermost enclosing handler or to a dedicated exception-exit node. Keep a known-safe list (`len`, `str`, `isinstance`, `.append`, …) with `may_raise = False` or you'll drown the analysis in noise.

**Read before hour 0:** Python `ast` docs · what a basic block is · CFG construction for `try`/`finally`.

---

## P2 — Analysis Engineer

**You own correctness and the false-positive rate — half the grade.**

| Phase | Deliverable |
|---|---|
| 1 | `Finding` + `fingerprint()` + JSON fixtures · lattice + join + `transfer()` · worklist fixpoint |
| 2 | Exit check + BFS witness path · **escape analysis** · confidence scoring · text/JSON reporters |
| 3 | Interprocedural summaries · `fix/rewrite.py` · patch verification loop |
| 4 | Bug-fix · `docs/04-limitations.md` — you know the edges best |

**Your highest-leverage 60 lines:** escape analysis. `return conn`, `self.conn = conn`, `list.append(conn)` — if the resource leaves the function, stop reasoning and downgrade to `POSSIBLE`. It roughly halves the FP rate on real code.

**Never let `dataflow.py` import `ast`.** It works only on P1's IR. That's what lets you develop against fixtures for ten hours.

**Read before hour 0:** worklist algorithm · monotone join / lattices · README Steps 3–6.

---

## P3 — Platform Engineer (n8n + CI)

**You ship the graded deliverable by hour 8, then build the differentiator.**

| Phase | Deliverable |
|---|---|
| 1 | `analyze()` stub · CLI skeleton with exit codes · **pre-commit hook · GitHub Action, both live** |
| 2 | SARIF + `upload-sarif` · Postgres schema · **n8n `ingest-findings`, `pr-comment`** |
| 3 | **n8n `triage-callback` + shared baseline** · `slack-alert` · `weekly-digest` · `fix-bot` |
| 4 | Demo environment · `docs/05-comparison.md` |

**Your novelty is the triage loop.** LeakGuard flags something → n8n posts a PR comment with **Real leak** / **False positive** buttons → dev clicks → n8n writes that fingerprint to a *shared* baseline with attribution → next CI run it's gone, team-wide, with an audit trail. Every other team will *claim* an FP rate; you demonstrate a system that measurably improves. Zero ML — fully deterministic, which keeps the "AST-based, not guessing" thesis intact.

**Framing you must get right in Q&A:** never say *"our backend is n8n."* Say *"the analyzer is a self-contained offline Python package; the team-scale control plane is orchestrated in n8n."* If judges think the analysis runs in n8n, the technical argument is lost before it starts.

**Hard constraint:** the analyzer never calls the network. The pre-commit hook works offline. Only findings — never source code — reach n8n, and only from CI.

**Read before hour 0:** SARIF 2.1.0 shape · `pre-commit` hook spec · GitHub composite actions.

---

## P4 — Interface Engineer

**Phase 1 you write the spec. Phases 2–3 you build the surfaces people see.**

| Phase | Deliverable |
|---|---|
| 1 | **~50-file test corpus** (`safe/` + `leaky/`) with expected verdicts · `test_corpus.py` |
| 2 | `leakguard bench` confusion matrix · `demo-repo/` with seeded leaks · Next.js scaffold on Vercel |
| 3 | **VS Code extension** (diagnostics + quick-fix) · dashboard charts |
| 4 | `docs/03-benchmark.md` · slides · demo rehearsal |

**The corpus is your most important deliverable, and it comes first.** Include the traps a judge will write — the decoy `with` that hides a leaking `conn`, the close-only-in-`except`, the loop that opens N and closes 1, the `return conn` that looks leaky but isn't. Those files are what P1 and P2 develop against.

**VS Code — do not build a Language Server.** ~120 lines of TypeScript: on save (debounced) shell out to `leakguard check --format json`, parse, push `vscode.Diagnostic` squiggles, register a `CodeActionProvider` that calls P2's `fix/rewrite.py` for the 💡 quick-fix. Scaffold with `yo code`. The CLI already emits JSON, so the extension is a thin client.

**Read before hour 0:** README's corpus section · precision/recall/F1 · the problem statement, twice.

---

# Working agreements

**Blocked more than 20 minutes? Say so out loud.** Don't burn an hour stuck.

**Finished early?** Help in this order: (1) P1's lane, (2) the corpus, (3) your own next phase.

**Never edit another person's files.** Open a PR against their branch or tell them. Two people in `cfg.py` at hour 14 is how you lose two hours to a merge conflict.

### Integration checkpoints — everyone stops and syncs

| Hour | Checkpoint |
|---|---|
| **2** | Contracts frozen · fakes exchanged |
| **8** | End-to-end works (fake engine, real plumbing) |
| **16** | Real CFG + real dataflow wired together |
| **18** | 🚦 Go/no-go gate |
| **26** | Feature freeze |

### Branches

```
main                    protected, always green
├── feat/cfg            P1
├── feat/dataflow       P2
├── feat/ci             P3
├── feat/n8n            P3
├── feat/corpus         P4
└── feat/ui             P4
```

PRs into `main`, one teammate reviews. **The review comments are themselves evidence of collaboration** — organisers are watching the repo. Commit small and often; four commits at hour 29 looks bad regardless of code quality.

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`

**Everyone reads README Steps 1 and 2 before hour 0.** If you don't share a mental model of the IR and the CFG, nothing else lines up.
