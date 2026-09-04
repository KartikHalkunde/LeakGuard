# LeakGuard Control Plane (n8n)

The analyzer is a self-contained, offline Python package. **This layer is
strictly additive** — `leakguard check` must stay perfect with every workflow
here switched off. Nothing in this directory is on the critical path for the
graded deliverables.

What this layer buys us is the thing the problem statement actually asks about:
*"be aggressive enough to catch real leaks, but not so aggressive that it gets
disabled by week two."* A triage loop that measurably lowers the false-positive
rate is a demonstrated answer, not a claimed one.

**Privacy contract: findings only, never source code.** A payload carries repo,
file path, line number, resource type, a fingerprint and a one-line reason.
The `snippet` field carries a single line of code and is the only source-ish
data that leaves CI — drop it in the ingest workflow if a judge pushes on this.

---

## Setup checklist

| # | Task |
|---|---|
| 1 | Self-host n8n + Postgres (Docker Compose is fine) |
| 2 | Run [`schema.sql`](schema.sql) — 4 tables, plus every query below as comments |
| 3 | Credentials: **Postgres**, **GitHub** (PAT with `repo` scope), **Slack** |
| 4 | Generate a shared secret: `openssl rand -hex 32` |
| 5 | Store it as `LEAKGUARD_SECRET` in **both** n8n (env or credential) **and** GitHub repo secrets |
| 6 | Note your webhook base URL, e.g. `https://n8n.example.com/webhook/leakguard` |

Consumers then wire it up with:

```yaml
- uses: KartikHalkunde/VH26-CodeBlooded@P3
  with:
    control-plane: https://n8n.example.com/webhook/leakguard
```

---

## Build order

Build in this order — each one is testable the moment it exists.

| # | Workflow | Why this order |
|---|---|---|
| **1** | `ingest-findings` | Nothing else has data without it |
| **2** | `GET /baseline` | Closes the loop with `baseline/store.py` — instantly verifiable |
| **3** | `pr-comment` | The visible output |
| **4** | `triage-callback` | **The differentiator** |
| 5 | `slack-alert`, `weekly-digest` | Polish |
| 6 | `fix-bot` | Only if time remains |

---

## ⚠️ The one gotcha that will cost you an hour

**On the Webhook node, enable "Raw Body".**

HMAC is computed over the exact bytes the Action sent. If n8n parses and
re-serialises the JSON before you verify, key order and whitespace change, the
digest differs, and every request fails signature verification with no obvious
cause. Turn on Raw Body and verify against `$binary` / the raw string, then
parse.

---

## 1. `ingest-findings`

**Trigger:** Webhook · `POST` · path `leakguard/ingest` · **Raw Body on** ·
Response mode "Using Respond to Webhook node"

**Test payload:** [`sample-payload.json`](sample-payload.json) — 10 real
findings from the live engine, with CI context attached. Paste it into the
webhook test panel, or:

```bash
curl -X POST https://n8n.example.com/webhook/leakguard/ingest \
  -H "Content-Type: application/json" \
  -H "X-LeakGuard-Signature: sha256=<digest>" \
  -d @integrations/n8n/sample-payload.json
```

Generate a matching digest locally with:

```bash
LEAKGUARD_SECRET=<your-secret> leakguard sign integrations/n8n/sample-payload.json
```

### Node 1 — Code: verify signature

```javascript
const crypto = require('crypto');

const raw = $input.first().json.body ?? $input.first().binary?.data?.toString('utf8');
const header = $input.first().json.headers['x-leakguard-signature'] || '';
const secret = $env.LEAKGUARD_SECRET;

const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

// Constant-time compare - a plain === leaks timing information.
const a = Buffer.from(header);
const b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw new Error('invalid signature');
}

return [{ json: JSON.parse(raw) }];
```

### Node 2 — Code: flatten findings for the UPSERT

```javascript
const p = $input.first().json;
const ctx = p.context ?? {};
return p.findings.map(f => ({
  json: {
    repo: ctx.repo, branch: ctx.branch, commit_sha: ctx.commit,
    pr_number: ctx.pr_number ?? null,
    fingerprint: f.fingerprint, confidence: f.confidence,
    resource: f.resource, file: f.file, function: f.function,
    line: f.acquired_at.line, variable: f.variable,
    reason: f.reason, exit_kind: f.exit_kind, severity: f.severity,
    fix_available: f.fix_available,
    leak_path: JSON.stringify(f.leak_path),
  },
}));
```

### Node 3 — Postgres: UPSERT

Use the `INSERT ... ON CONFLICT` statement in [`schema.sql`](schema.sql).

> **Do not drop the `CASE WHEN findings.status = 'suppressed'` clause.**
> Without it a re-scan resurrects suppressed findings and the ratchet silently
> breaks — you would not notice until the demo.

### Node 4 — Postgres: record the run

`INSERT INTO runs (...)` from `p.summary` + `p.context`. This is what powers
the leak-debt chart; without it P4 has nothing to plot.

### Node 5 — Postgres: close out fixed findings

The `UPDATE findings SET status = 'fixed'` statement, passing the array of
fingerprints present in this payload.

### Node 6 — Respond to Webhook

```json
{ "received": {{ $json.total }}, "repo": "{{ $json.repo }}" }
```

**Verify:** run it twice with the same payload. Row count must not change —
the UPSERT is idempotent.

---

## 2. `GET /baseline` — the shared ratchet

**This is the one that closes the loop with the Python code**, so build it
second. `leakguard/baseline/store.py` already calls it.

**Trigger:** Webhook · `GET` · path `leakguard/baseline`

**The contract — `store.py` parses exactly this shape:**

```json
{
  "version": 1,
  "created": "2026-09-05T10:00:00Z",
  "suppressed": [
    {
      "fingerprint": "34c5ba7c11c3c4fd",
      "reason": "legacy, tracked in JIRA-4412",
      "file": "app/db.py",
      "function": "fetch",
      "at": "2026-09-05T10:00:00Z"
    }
  ]
}
```

Only `fingerprint` is load-bearing; the rest is for humans. Query param:
`?repo=<url-encoded>`. Optional header `X-API-Key` — `store.py` sends it when
`LEAKGUARD_API_KEY` is set.

Use the `json_build_object` query from `schema.sql`, then Respond to Webhook.

**Verify end to end:**

```bash
# .leakguard.toml
[leakguard]
control_plane = "https://n8n.example.com/webhook/leakguard"
```

```bash
leakguard check .
# stderr should read: "N finding(s) suppressed by baseline (remote)"
```

`remote` rather than `local` means the whole loop works. If n8n is down it
prints `local` and CI still passes — that fallback is deliberate, and worth
saying out loud in the demo.

---

## 3. `pr-comment`

**Trigger:** called from `ingest-findings` when `pr_number` is present.

Group findings by file, build markdown, post with the GitHub node
(`Create Comment` on issue `pr_number`).

````markdown
### 🛡️ LeakGuard — 4 definite, 6 likely

<details open>
<summary><b>app/export.py:4</b> — <code>sqlite3.Connection</code> · <b>definite</b></summary>

```
opened   line 4    conn = sqlite3.connect(db)
path     4 → 6 (return)
reason   reaches function exit with conn still open
```

**Is this right?**
[✅ Real leak](https://n8n.example.com/webhook/leakguard/triage?fp=34c5ba7c11c3c4fd&v=real&t=HMAC) ·
[🚫 False positive](https://n8n.example.com/webhook/leakguard/triage?fp=34c5ba7c11c3c4fd&v=fp&t=HMAC)
</details>
````

**Why links and not buttons:** GitHub comments render markdown only — no
interactive controls. A link fires the webhook on click and n8n returns a
confirmation page. Sign each with an HMAC over `fingerprint + verdict` so the
URLs cannot be forged:

```javascript
const crypto = require('crypto');
const token = crypto.createHmac('sha256', $env.LEAKGUARD_SECRET)
                    .update(`${f.fingerprint}:${verdict}`)
                    .digest('hex').slice(0, 16);
```

---

## 4. `triage-callback` — the differentiator

**Trigger:** Webhook · `GET` · path `leakguard/triage`

```
verify HMAC over (fp, v)
  → INSERT INTO triage (fingerprint, verdict, reason, actor)
  → IF verdict = 'false_positive':
        UPDATE findings SET status = 'suppressed'
  → Respond with an HTML "Recorded ✓" page
```

Respond with `Content-Type: text/html` — a developer clicked a link in a
browser, so JSON is a poor landing page.

**Why this matters:** every other team will *claim* a false-positive rate. This
shows a system that measurably improves — a developer clicks, the fingerprint
enters the shared baseline with attribution, and the next CI run is quieter
team-wide. Zero ML, fully deterministic, so the "AST-based, not guessing"
thesis stays intact.

**Demo it:** run `leakguard check`, click *False positive* on the PR comment,
re-run, watch the finding vanish. Live, in about twenty seconds.

---

## 5–6. Remaining workflows

| Workflow | Trigger | Notes |
|---|---|---|
| `slack-alert` | after ingest | **`DEFINITE` on the default branch only.** Alerting on everything is the same crying-wolf failure at the notification layer — a judge may well ask |
| `weekly-digest` | Schedule | Leak-debt trend, top files, FP rate |
| `dashboard-api` | Webhook ×3 | `GET /findings`, `/trend`, `/fp-rate` for P4 — queries are in `schema.sql` |
| `fix-bot` | after ingest | AI drafts patch → **re-run `leakguard check` to verify** → open PR only if clean. The analyzer is the judge; an unverified patch never reaches a human |
| `error-handler` | Error Trigger | Global sink → `system_errors`, same pattern as before |

---

## Talking about this layer

Never say *"our backend is n8n."* Say:

> *"The analyzer is a self-contained, offline Python package. The team-scale
> control plane is orchestrated in n8n."*

If judges believe the analysis runs in n8n, the technical argument is lost
before it starts. Demo the CLI blocking a commit **offline** first; reveal the
control plane as act two.
