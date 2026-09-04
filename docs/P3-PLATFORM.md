# P3 — Platform Engineer (n8n + CI)

**You own:** `leakguard/cli.py`, `config.py`, `report/sarif.py`, `baseline/store.py`, `integrations/pre-commit/`, `integrations/action/`, all n8n workflows, the Postgres schema

**You ship the graded deliverable by hour 8, then build the differentiator.**

---

## The framing you must get right

Never say *"our backend is n8n."* Say:

> *"The analyzer is a self-contained, offline Python package. The team-scale control plane is orchestrated in n8n."*

If judges believe the analysis runs in n8n, the technical argument is lost before it starts.

**Hard constraints — these are your architectural guardrails:**

1. The analyzer **never makes a network call.** The pre-commit hook works offline.
2. **Source code never leaves the machine.** Only findings — path, line, resource type, fingerprint — reach n8n, and **only from CI**, never from the local hook.
3. Everything in n8n is **strictly additive.** `leakguard check` must be perfect with n8n switched off. Demo the core first, offline; reveal the control plane as act two.

---

## Task 1 — `cli.py` (hours 2–4)

Ship this against a **stub** `analyze()` returning hardcoded findings. The whole pipeline becomes testable at hour 4 while the engine is still being built.

```python
import argparse, sys, json
from pathlib import Path

EXIT_OK, EXIT_FINDINGS, EXIT_ERROR = 0, 1, 2

def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="leakguard")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check")
    c.add_argument("paths", nargs="*", default=["."])
    c.add_argument("--format", choices=["text", "json", "sarif"], default="text")
    c.add_argument("--fail-on", choices=["definite","likely","possible","never"],
                   default="definite")
    c.add_argument("--diff-only", action="store_true")
    c.add_argument("--baseline", default=".leakguard-baseline.json")
    c.add_argument("--config", default=".leakguard.toml")
    c.add_argument("--jobs", type=int, default=0)

    sub.add_parser("baseline").add_argument("paths", nargs="*", default=["."])
    sub.add_parser("bench")
    sub.add_parser("explain").add_argument("target")       # FILE:FUNC
    f = sub.add_parser("fix")
    f.add_argument("paths", nargs="*", default=["."])
    f.add_argument("--write", action="store_true")

    args = p.parse_args(argv)
    try:
        return dispatch(args)
    except Exception as e:
        print(f"leakguard: internal error: {e}", file=sys.stderr)
        return EXIT_ERROR
```

### Exit codes — the CI contract

| Code | Meaning | CI behaviour |
|---|---|---|
| `0` | clean, or all findings below threshold | ✅ pass |
| `1` | findings at or above `--fail-on` | ❌ **blocks the build** |
| `2` | tool error — parse failure, bad config, crash | ⚠️ warns, does **not** block |

**The asymmetry is deliberate: fail closed on findings, fail open on ourselves.** A gate that bricks CI when it meets syntax it doesn't understand gets uninstalled the same afternoon. Say this in Q&A — it reads as product judgment, not a bug.

### `config.py`

```toml
# .leakguard.toml
[leakguard]
fail_on = "definite"
exclude = ["tests/", "migrations/", ".venv/"]

[[leakguard.resources]]
id = "myorg.DbPool"
acquire = ["myorg.pool.acquire"]
release = ["release", "close"]
context_manager = true
```

Extensible resources matter: when a judge asks *"what about my library?"*, **"here's the config file, add four lines"** is a great answer.

---

## Task 2 — Pre-commit hook (hours 4–5)

`integrations/pre-commit/.pre-commit-hooks.yaml`:

```yaml
- id: leakguard
  name: LeakGuard resource-leak check
  description: Detects resources opened but not closed on all code paths
  entry: leakguard check
  language: python
  types: [python]
  pass_filenames: true
  require_serial: false
```

Consumers add to their `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/<org>/leakguard
    rev: v0.1.0
    hooks:
      - id: leakguard
        args: [--fail-on=definite]
```

Test it for real:

```bash
cd demo-repo && pre-commit install
git add app/leaky.py && git commit -m "test"     # must be BLOCKED
```

**Latency budget: under 1 second.** Hooks that feel slow get bypassed with `--no-verify`.

---

## Task 3 — GitHub Action (hours 5–8)

`integrations/action/action.yml`:

```yaml
name: LeakGuard
description: Static resource-leak detection for Python
branding: { icon: shield, color: red }
inputs:
  paths:      { description: Paths to scan,        default: "." }
  fail-on:    { description: Threshold,            default: "definite" }
  diff-only:  { description: Only changed files,   default: "true" }
  webhook:    { description: Control-plane URL,    required: false }
runs:
  using: composite
  steps:
    - uses: actions/setup-python@v5
      with: { python-version: "3.11" }
    - run: pip install leakguard
      shell: bash
    - id: scan
      run: |
        set +e
        leakguard check ${{ inputs.paths }} \
          --fail-on ${{ inputs.fail-on }} \
          ${{ inputs.diff-only == 'true' && '--diff-only' || '' }} \
          --format sarif > leakguard.sarif
        echo "code=$?" >> $GITHUB_OUTPUT
        leakguard check ${{ inputs.paths }} --format json > leakguard.json
        set -e
      shell: bash
    - uses: github/codeql-action/upload-sarif@v3
      if: always()
      with: { sarif_file: leakguard.sarif }
    - if: always() && inputs.webhook != ''
      run: |
        curl -sf -X POST "${{ inputs.webhook }}" \
          -H "Content-Type: application/json" \
          -H "X-LeakGuard-Signature: $(python -c "...hmac...")" \
          -d @leakguard.json || echo "control plane unreachable, continuing"
      shell: bash
    - if: steps.scan.outputs.code == '1'
      run: exit 1
      shell: bash
```

**Note the `|| echo` on the webhook step.** If n8n is down, CI still works correctly. Never let the optional layer break the required one.

### The demo money shot

Set up `demo-repo` with **branch protection requiring the LeakGuard check**. Open a PR with a seeded leak. Judges see a red ❌ and a merge button that won't press. Rehearse this — it's your strongest single moment.

---

## Task 4 — `report/sarif.py` (hours 8–11)

GitHub renders SARIF as **inline annotations on the PR diff**. ~40 lines for a large amount of perceived polish.

```python
def to_sarif(findings, version="0.1.0") -> dict:
    rules, results = {}, []
    for f in findings:
        rule_id = f"leakguard/{f.resource.replace('.', '-')}"
        rules.setdefault(rule_id, {
            "id": rule_id,
            "shortDescription": {"text": f"Unclosed {f.resource}"},
            "fullDescription": {"text":
                "A resource is opened but not closed on all code paths."},
            "defaultConfiguration": {
                "level": {"definite": "error", "likely": "warning",
                          "possible": "note"}[f.confidence.value]},
            "helpUri": "https://github.com/<org>/leakguard#readme",
        })
        results.append({
            "ruleId": rule_id,
            "level": {"definite": "error", "likely": "warning",
                      "possible": "note"}[f.confidence.value],
            "message": {"text": f.reason},
            "partialFingerprints": {"leakguardFingerprint": f.fingerprint},
            "locations": [{"physicalLocation": {
                "artifactLocation": {"uri": f.file},
                "region": {"startLine": f.acquired_line,
                           "startColumn": max(f.acquired_col, 1)},
            }}],
            "codeFlows": [{"threadFlows": [{"locations": [
                {"location": {
                    "physicalLocation": {
                        "artifactLocation": {"uri": f.file},
                        "region": {"startLine": s.line}},
                    "message": {"text": s.note}}}
                for s in f.leak_path
            ]}]}],
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{"tool": {"driver": {
            "name": "LeakGuard", "version": version,
            "informationUri": "https://github.com/<org>/leakguard",
            "rules": list(rules.values())}}, "results": results}],
    }
```

**`codeFlows` is the detail worth having** — GitHub renders the witness path as a clickable step-through of the leaking path in the PR. Almost nobody at a hackathon knows SARIF supports this.

`partialFingerprints` lets GitHub track a finding across commits even when lines move.

---

## Task 5 — `baseline/store.py` (hours 11–13)

The ratchet. Day one is green in any legacy repo; the count can only go down.

```python
import json, os
from pathlib import Path

class Baseline:
    def __init__(self, path: Path, remote_url: str | None = None):
        self.path, self.remote = path, remote_url
        self.suppressed: dict[str, dict] = {}

    def load(self):
        if self.remote:
            try:
                self.suppressed = fetch_remote(self.remote)   # n8n endpoint
                return
            except Exception:
                pass                                          # fall through
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self.suppressed = {e["fingerprint"]: e for e in data["suppressed"]}

    def filter(self, findings):
        return [f for f in findings if f.fingerprint not in self.suppressed]

    def snapshot(self, findings, reason="baseline snapshot"):
        self.path.write_text(json.dumps({
            "version": 1,
            "created": now_iso(),
            "suppressed": [{"fingerprint": f.fingerprint, "reason": reason,
                            "file": f.file, "function": f.function,
                            "at": now_iso()} for f in findings],
        }, indent=2))
```

**Remote-first with local fallback.** If the control plane is unreachable, the local file still works. Never let n8n being down break CI.

---

## Task 6 — Postgres schema (hour 13)

```sql
CREATE TABLE findings (
  id             BIGSERIAL PRIMARY KEY,
  fingerprint    TEXT NOT NULL,
  repo           TEXT NOT NULL,
  branch         TEXT,
  commit_sha     TEXT,
  pr_number      INT,
  confidence     TEXT NOT NULL,
  resource       TEXT NOT NULL,
  file           TEXT NOT NULL,
  function        TEXT,
  line           INT,
  reason         TEXT,
  first_seen     TIMESTAMPTZ DEFAULT now(),
  last_seen      TIMESTAMPTZ DEFAULT now(),
  status         TEXT DEFAULT 'open',   -- open | fixed | suppressed
  UNIQUE (repo, fingerprint)
);

CREATE TABLE triage (
  id           BIGSERIAL PRIMARY KEY,
  fingerprint  TEXT NOT NULL,
  repo         TEXT NOT NULL,
  verdict      TEXT NOT NULL,           -- real_leak | false_positive
  reason       TEXT,
  actor        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE runs (
  id           BIGSERIAL PRIMARY KEY,
  repo         TEXT NOT NULL,
  commit_sha   TEXT,
  definite     INT, likely INT, possible INT,
  files        INT, duration_ms INT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

`runs` is what powers the **leak-debt-over-time** chart — your best dashboard visual.

---

## Task 7 — The n8n workflows

You've built harder than this with Axon. Six workflows.

### 7a — `ingest-findings` (webhook)

```
Webhook POST /leakguard/ingest
  → verify HMAC signature (X-LeakGuard-Signature)     ← reuse your Axon pattern
  → validate payload shape
  → Postgres: UPSERT findings ON CONFLICT (repo, fingerprint)
              DO UPDATE SET last_seen = now(), confidence = EXCLUDED.confidence
  → Postgres: INSERT INTO runs (summary counts)
  → mark findings not in this payload as status='fixed'
  → respond 200 {"received": n}
```

**Sign the payload.** An unauthenticated ingest endpoint on a security tool is the kind of thing a judge will poke at. HMAC with a shared secret in the Action's repo secrets.

### 7b — `pr-comment`

Triggered after ingest when `pr_number` is present.

```
→ group findings by file
→ build markdown comment
→ GitHub node: create issue comment on the PR
```

Comment template:

````markdown
### 🛡️ LeakGuard — 1 definite, 2 likely

<details open>
<summary><b>app/export.py:12</b> — <code>sqlite3.Connection</code> · <b>definite</b></summary>

```
opened   line 12   conn = sqlite3.connect(db)
path     12 → 15 → 17 (return)
reason   reaches function exit with conn still open
close    line 22   unreachable from line 17
```

**Is this right?**
[✅ Real leak](https://n8n.example.com/webhook/triage?fp=a3f9c21e&v=real&t=<hmac>) ·
[🚫 False positive](https://n8n.example.com/webhook/triage?fp=a3f9c21e&v=fp&t=<hmac>)
</details>
````

**How the "buttons" work:** GitHub comments can't hold real buttons, so use **markdown links to n8n webhook URLs**. Clicking opens a browser, fires the webhook, and n8n returns a small confirmation HTML page. Sign each link with an HMAC over `fingerprint + verdict` so the URLs can't be forged — same trick you used in Axon.

### 7c — `triage-callback` — 🔑 your novelty

```
Webhook GET /leakguard/triage?fp=&v=&t=
  → verify HMAC over (fp, v)
  → INSERT INTO triage (fingerprint, verdict, actor, ...)
  → IF verdict == 'false_positive':
        UPDATE findings SET status='suppressed'
        → append fingerprint to the shared baseline
  → respond with an HTML "Recorded ✓" page
```

**This is the feature that answers the problem statement's core tension.** Every other team will *claim* a false-positive rate. You demonstrate a system that measurably improves — with zero ML, fully deterministic, which keeps the "AST-based, not guessing" thesis intact.

Also expose `GET /leakguard/baseline?repo=` so the Action can pull the shared baseline before scanning. That's what makes suppression team-wide rather than one developer's local file.

### 7d — `slack-alert`

Only on `DEFINITE` on the default branch. **Do not alert on every finding** — that's the same crying-wolf failure at the notification layer, and a judge may well ask about it.

### 7e — `weekly-digest` (schedule trigger)

Leak debt trend, top offending files, FP rate, fixes merged this week.

### 7f — `fix-bot` — the Axon callback

```
findings where fix_available = true
  → AI Agent node: draft a patch
  → apply to a scratch branch
  → run `leakguard check` on the patched file       ← deterministic verification
  → IF still flagged: DISCARD, log, stop
  → ELSE: GitHub node → open PR "fix: close <resource> in <file>"
```

**The LLM proposes; the analyzer judges.** An unverified patch never reaches a human. Say this out loud in the demo — it's the same fail-closed philosophy as Axon, applied to our own output, and it's a genuinely strong narrative throughline.

### 7g — Dashboard API

Three read endpoints for P4: `GET /findings`, `GET /trend`, `GET /fp-rate`. Hash-key auth, same pattern as Axon's Logs API.

---

## Your schedule

| Hours | Task |
|---|---|
| 0–2 | Contracts · repo scaffold · CI · branch protection |
| 2–4 | `analyze()` stub · `cli.py` · exit codes · `config.py` |
| 4–5 | **Pre-commit hook live** |
| 5–8 | **GitHub Action live · red ❌ on a real PR** |
| 8–11 | `report/sarif.py` + `upload-sarif` + codeFlows |
| 11–13 | `baseline/store.py` · Postgres schema |
| 13–16 | n8n: `ingest-findings` · HMAC · UPSERT |
| 16–18 | n8n: `pr-comment` with triage links |
| 18–21 | **n8n: `triage-callback` + shared baseline** |
| 21–24 | n8n: `slack-alert` · `weekly-digest` · dashboard API |
| 24–26 | n8n: `fix-bot` with verification |
| 26–30 | Demo env · `docs/05-comparison.md` · rehearse |

---

## Read before hour 0

- [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/) — skim `results`, `codeFlows`, `partialFingerprints`
- [pre-commit hook spec](https://pre-commit.com/#creating-new-hooks)
- GitHub composite actions

**Demo segments you own:** the blocked PR, and the triage loop + baseline ratchet. Rehearse the framing line until it's automatic.
