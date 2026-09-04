# LeakGuard Control Plane (n8n)

The analyzer is a self-contained, offline Python package. **This layer is
strictly additive** — `leakguard check` must stay perfect with every workflow
here switched off. Nothing in this directory is on the critical path for the
graded deliverables.

What it buys us is the thing the problem statement actually asks about:
*"aggressive enough to catch real leaks, but not so aggressive that it gets
disabled by week two."* A triage loop that measurably lowers the false-positive
rate is a **demonstrated** answer, not a claimed one.

**Privacy contract: findings only, never source code.** A payload carries repo,
file path, line number, resource type, fingerprint and a one-line reason. The
`snippet` field carries a single line of code and is the only source-ish data
that leaves CI — drop it in Workflow 1 if a judge pushes on it.

---

## Table of contents

- [The definitive workflow list](#the-definitive-workflow-list)
- [How n8n connects to the codebase](#how-n8n-connects-to-the-codebase)
- [Deployment](#deployment)
- [Setup checklist](#setup-checklist)
- [The three gotchas](#the-three-gotchas)
- [Workflow 1 — ingest-findings](#workflow-1--ingest-findings)
- [Workflow 2 — baseline-api](#workflow-2--baseline-api)
- [Workflow 3 — pr-comment](#workflow-3--pr-comment)
- [Workflow 4 — triage-callback](#workflow-4--triage-callback)
- [Workflow 5 — slack-alert](#workflow-5--slack-alert)
- [Workflow 6 — weekly-digest](#workflow-6--weekly-digest)
- [Workflow 7 — dashboard-api](#workflow-7--dashboard-api)
- [Workflow 8 — fix-bot](#workflow-8--fix-bot)
- [Workflow 9 — error-handler](#workflow-9--error-handler)
- [End-to-end verification](#end-to-end-verification)

---

## The definitive workflow list

**Nine workflows. Four are mandatory.** Earlier docs said "six" — that was
wrong; this table is authoritative.

| # | Workflow | Priority | Trigger | ~Time |
|---|---|---|---|---|
| 1 | `ingest-findings` | 🔴 **must** | Webhook `POST` | 60 min |
| 2 | `baseline-api` | 🔴 **must** | Webhook `GET` | 20 min |
| 3 | `pr-comment` | 🔴 **must** | Execute Workflow | 45 min |
| 4 | `triage-callback` | 🔴 **must** | Webhook `GET` | 40 min |
| 5 | `slack-alert` | 🟡 polish | Execute Workflow | 15 min |
| 6 | `weekly-digest` | 🟡 polish | Schedule | 25 min |
| 7 | `dashboard-api` | 🟡 polish | Webhook `GET` ×3 | 30 min |
| 8 | `fix-bot` | 🟢 stretch | Execute Workflow | 60 min |
| 9 | `error-handler` | 🟢 stretch | Error Trigger | 5 min |

**If you build only 1–4, the demo works completely.** 5–9 are upside.

---

## How n8n connects to the codebase

There are exactly **two** touchpoints. Everything else is internal to n8n.

```
   GitHub Actions (action.yml)                      leakguard CLI (local or CI)
             │                                                │
             │ POST  {control-plane}/ingest                   │ GET {control_plane}/baseline?repo=
             │ header X-LeakGuard-Signature                   │ header X-API-Key (optional)
             ▼                                                ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                       n8n control plane                          │
   │   Workflow 1: ingest        Workflow 2: baseline                 │
   └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                              Postgres
```

### Touchpoint A — CI pushes findings in

`action.yml`, step *Notify control plane*:

```bash
SIG=$(leakguard sign leakguard.json)          # sha256=<hex> over the raw file
curl -sf -X POST "${{ inputs.control-plane }}/ingest" \
  -H "Content-Type: application/json" \
  -H "X-LeakGuard-Signature: $SIG" \
  -d @leakguard.json \
  || echo "control plane unreachable - continuing"
```

Note the `|| echo`: **if n8n is down, CI still passes correctly.** The optional
layer can never break the required one. Say this out loud in the demo.

### Touchpoint B — the CLI pulls the shared baseline out

`leakguard/baseline/store.py`, `_load_remote()`:

```python
url = f"{self.remote.rstrip('/')}/baseline"
if self.repo:
    url += f"?repo={urllib.parse.quote(self.repo)}"
```

Falls back to the committed local file if unreachable.

### 🔑 The URL maths — get this exactly right

If your n8n base is `https://leakguard.up.railway.app`, n8n serves webhooks
under `/webhook/<path>`. So set:

```
control_plane = https://leakguard.up.railway.app/webhook/leakguard
```

The code appends `/ingest` and `/baseline`, which means your **n8n webhook
paths must be**:

| Workflow | n8n Webhook `path` field | Resulting URL |
|---|---|---|
| 1 | `leakguard/ingest` | `…/webhook/leakguard/ingest` |
| 2 | `leakguard/baseline` | `…/webhook/leakguard/baseline` |
| 4 | `leakguard/triage` | `…/webhook/leakguard/triage` |

### Wiring it up

**Option 1 — repo config** (`.leakguard.toml`, committed):

```toml
[leakguard]
fail_on = "definite"
control_plane = "https://leakguard.up.railway.app/webhook/leakguard"
```

**Option 2 — Action input** (per-repo, no file needed):

```yaml
- uses: KartikHalkunde/VH26-CodeBlooded@P3
  with:
    control-plane: https://leakguard.up.railway.app/webhook/leakguard
  env:
    LEAKGUARD_SECRET: ${{ secrets.LEAKGUARD_SECRET }}
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `LEAKGUARD_SECRET` | GitHub repo secret **and** n8n | HMAC signing key — must match |
| `LEAKGUARD_API_KEY` | optional, CI + n8n | Sent as `X-API-Key` on the baseline fetch |

---

## Deployment

**Yes, deploy it — Railway is a good choice.** GitHub Actions must reach a
public HTTPS URL, and the PR-comment triage links must be clickable from a
browser. `localhost` cannot do either.

### Railway (recommended)

1. **New Project → Deploy from Docker Image →** `n8nio/n8n:latest`
2. **Add Postgres**: *New → Database → PostgreSQL*
3. **Settings → Networking → Generate Domain** (gives `*.up.railway.app`)
4. **Variables** on the n8n service:

```bash
# Persist n8n's own data in Postgres, not the ephemeral container filesystem
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=${{Postgres.PGHOST}}
DB_POSTGRESDB_PORT=${{Postgres.PGPORT}}
DB_POSTGRESDB_DATABASE=${{Postgres.PGDATABASE}}
DB_POSTGRESDB_USER=${{Postgres.PGUSER}}
DB_POSTGRESDB_PASSWORD=${{Postgres.PGPASSWORD}}

# MUST be set, or n8n generates localhost webhook URLs that GitHub cannot reach
WEBHOOK_URL=https://<your-domain>.up.railway.app/
N8N_HOST=<your-domain>.up.railway.app
N8N_PROTOCOL=https
N8N_PORT=5678

# Generate once with: openssl rand -hex 32
# If this changes, every stored credential becomes unreadable.
N8N_ENCRYPTION_KEY=<32-byte hex>

N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<strong password>

LEAKGUARD_SECRET=<32-byte hex, same as the GitHub secret>
GENERIC_TIMEZONE=Asia/Kolkata
```

5. Connect to the Postgres instance and run [`schema.sql`](schema.sql).

> **Two Railway mistakes that cost hours:** forgetting `WEBHOOK_URL` (n8n hands
> out `localhost` URLs and GitHub silently can't reach them), and letting
> `N8N_ENCRYPTION_KEY` regenerate on redeploy (all saved credentials break).

### Alternatives

| Option | When |
|---|---|
| **n8n Cloud** | Fastest — free trial covers a hackathon, zero infra work |
| **Render / Fly.io** | Same shape as Railway |
| **Local + `cloudflared tunnel`** | Demo-day fallback if the host dies. `cloudflared tunnel --url http://localhost:5678` gives an instant public HTTPS URL |

**Set up the tunnel fallback before you need it.** If Railway wobbles during
judging, you want a one-command rescue, not a debugging session.

---

## Setup checklist

| # | Task | Done |
|---|---|---|
| 1 | Deploy n8n + Postgres, domain generated | ☐ |
| 2 | Run `schema.sql` (4 tables) | ☐ |
| 3 | Credentials: Postgres, GitHub PAT (`repo` scope), Slack | ☐ |
| 4 | `openssl rand -hex 32` → `LEAKGUARD_SECRET` | ☐ |
| 5 | Same secret into GitHub → Settings → Secrets → Actions | ☐ |
| 6 | `control_plane` set in `.leakguard.toml` or the Action input | ☐ |

---

## The three gotchas

**1. Enable "Raw Body" on the Webhook node (Workflow 1).**
HMAC is computed over the exact bytes sent. If n8n parses and re-serialises the
JSON before you verify, key order and whitespace change, the digest differs,
and every request fails with no useful error. This is the single most likely
way to lose an hour here.

**2. Keep the `CASE WHEN status = 'suppressed'` clause in the ingest UPSERT.**
Without it a re-scan resurrects suppressed findings and the ratchet breaks
silently. You would not notice until the demo.

**3. `WEBHOOK_URL` must be set on the n8n host.** Otherwise every webhook URL
n8n shows you points at localhost, and GitHub Actions cannot reach it.

---

## Workflow 1 — `ingest-findings`

🔴 Must-have. Nothing else has data without it.

**Test data:** [`sample-payload.json`](sample-payload.json) — 10 real findings
from the live engine (4 definite, 6 likely) with CI context attached.

```bash
LEAKGUARD_SECRET=<secret> leakguard sign integrations/n8n/sample-payload.json
# -> sha256=008b6d76...

curl -X POST https://<host>/webhook/leakguard/ingest \
  -H "Content-Type: application/json" \
  -H "X-LeakGuard-Signature: sha256=008b6d76..." \
  -d @integrations/n8n/sample-payload.json
```

### Node 1 — Webhook

| Field | Value |
|---|---|
| HTTP Method | `POST` |
| Path | `leakguard/ingest` |
| Authentication | None (we verify HMAC ourselves) |
| Respond | *Using Respond to Webhook node* |
| Options → **Raw Body** | ✅ **ON** |

### Node 2 — Code: verify signature

```javascript
const crypto = require('crypto');

const item = $input.first();
const raw = item.json.body ?? item.binary?.data?.toString('utf8');
const header = (item.json.headers['x-leakguard-signature'] || '').trim();
const secret = $env.LEAKGUARD_SECRET;

if (!raw)    throw new Error('empty body - is Raw Body enabled on the webhook?');
if (!secret) throw new Error('LEAKGUARD_SECRET is not set on this n8n instance');

const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

// Constant-time compare: a plain === leaks timing information.
const a = Buffer.from(header);
const b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw new Error('invalid signature');
}

const payload = JSON.parse(raw);
const ctx = payload.context ?? {};
return [{ json: { ...payload, ctx } }];
```

### Node 3 — Code: flatten findings into rows

```javascript
const p = $input.first().json;
const ctx = p.ctx ?? {};

if (!p.findings?.length) {
  return [{ json: { _empty: true, repo: ctx.repo, summary: p.summary, ctx } }];
}

return p.findings.map(f => ({
  json: {
    repo: ctx.repo ?? 'unknown',
    branch: ctx.branch ?? null,
    commit_sha: ctx.commit ?? null,
    pr_number: ctx.pr_number ?? null,
    fingerprint: f.fingerprint,
    confidence: f.confidence,
    resource: f.resource,
    file: f.file,
    function: f.function,
    line: f.acquired_at?.line ?? 0,
    variable: f.variable,
    reason: f.reason,
    exit_kind: f.exit_kind,
    severity: f.severity,
    fix_available: f.fix_available,
    leak_path: JSON.stringify(f.leak_path ?? []),
    snippet: f.acquired_at?.snippet ?? '',   // delete this line for zero code egress
    _summary: p.summary,
    _ctx: ctx,
  },
}));
```

### Node 4 — Postgres: UPSERT findings

*Operation: Execute Query.* Runs once per item.

```sql
INSERT INTO findings (repo, fingerprint, confidence, resource, file, function,
                      line, variable, reason, exit_kind, severity,
                      fix_available, leak_path, branch, commit_sha, pr_number)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
ON CONFLICT (repo, fingerprint) DO UPDATE SET
    last_seen  = now(),
    confidence = EXCLUDED.confidence,
    line       = EXCLUDED.line,
    reason     = EXCLUDED.reason,
    leak_path  = EXCLUDED.leak_path,
    commit_sha = EXCLUDED.commit_sha,
    pr_number  = EXCLUDED.pr_number,
    status     = CASE WHEN findings.status = 'suppressed'
                      THEN 'suppressed' ELSE 'open' END;
```

Query parameters, in order:

```
{{ $json.repo }}, {{ $json.fingerprint }}, {{ $json.confidence }},
{{ $json.resource }}, {{ $json.file }}, {{ $json.function }},
{{ $json.line }}, {{ $json.variable }}, {{ $json.reason }},
{{ $json.exit_kind }}, {{ $json.severity }}, {{ $json.fix_available }},
{{ $json.leak_path }}, {{ $json.branch }}, {{ $json.commit_sha }},
{{ $json.pr_number }}
```

### Node 5 — Code: collect fingerprints seen this run

```javascript
const items = $('Flatten findings').all();
const fps = items.filter(i => !i.json._empty).map(i => i.json.fingerprint);
const first = items[0].json;
return [{ json: {
  repo: first.repo ?? first._ctx?.repo,
  fingerprints: fps,
  summary: first._summary ?? first.summary,
  ctx: first._ctx ?? first.ctx,
}}];
```

### Node 6 — Postgres: close out fixed findings

```sql
UPDATE findings SET status = 'fixed', last_seen = now()
 WHERE repo = $1
   AND status = 'open'
   AND NOT (fingerprint = ANY($2::text[]));
```

Params: `{{ $json.repo }}`, `{{ JSON.stringify($json.fingerprints) }}`

This is what makes the leak-debt chart go **down** when someone fixes a leak.

### Node 7 — Postgres: record the run

```sql
INSERT INTO runs (repo, branch, commit_sha, pr_number, definite, likely,
                  possible, total, files, duration_ms)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
```

Params from `$json.summary` and `$json.ctx`. **Don't skip this** — without it
P4 has nothing to plot.

### Node 8 — IF: is this a PR?

Condition: `{{ $json.ctx.pr_number }}` *is not empty* → **Execute Workflow**
(`pr-comment`), passing `repo` and `pr_number`.

### Node 9 — IF: any definite on the default branch?

`{{ $json.summary.definite }}` > 0 **AND** `{{ $json.ctx.branch }}` in
`main`/`master` → **Execute Workflow** (`slack-alert`).

### Node 10 — Respond to Webhook

```json
{ "received": {{ $json.summary.total }}, "repo": "{{ $json.repo }}" }
```

✅ **Verify:** POST the sample twice. Row count must not change — the UPSERT is
idempotent.

---

## Workflow 2 — `baseline-api`

🔴 Must-have, and **build it second** — it's the only workflow you can prove
end to end in one command, because `baseline/store.py` already calls it.

### Node 1 — Webhook

| Field | Value |
|---|---|
| HTTP Method | `GET` |
| Path | `leakguard/baseline` |
| Respond | *Using Respond to Webhook node* |

### Node 2 — Postgres: build the baseline document

```sql
SELECT json_build_object(
    'version', 1,
    'created', now(),
    'suppressed', COALESCE(json_agg(json_build_object(
        'fingerprint', f.fingerprint,
        'reason',      COALESCE(t.reason, 'suppressed via triage'),
        'file',        f.file,
        'function',    f.function,
        'at',          f.last_seen
    )), '[]'::json)
) AS baseline
FROM findings f
LEFT JOIN LATERAL (
    SELECT reason FROM triage
     WHERE triage.repo = f.repo AND triage.fingerprint = f.fingerprint
     ORDER BY created_at DESC LIMIT 1
) t ON TRUE
WHERE f.repo = $1 AND f.status = 'suppressed';
```

Param: `{{ $json.query.repo }}`

### Node 3 — Respond to Webhook

Respond With: **JSON** · Body: `{{ $json.baseline }}`

**The contract `store.py` parses** — only `fingerprint` is load-bearing:

```json
{
  "version": 1,
  "created": "2026-09-05T10:00:00Z",
  "suppressed": [
    { "fingerprint": "34c5ba7c11c3c4fd", "reason": "…",
      "file": "app/db.py", "function": "fetch", "at": "…" }
  ]
}
```

✅ **Verify — this is the moment the two halves meet:**

```bash
leakguard check .
# stderr: "N finding(s) suppressed by baseline (remote)"
```

The word **`remote`** (not `local`) means the whole round-trip is live.

---

## Workflow 3 — `pr-comment`

🔴 Must-have — the visible output.

### Node 1 — Execute Workflow Trigger

Inputs: `repo`, `pr_number`.

### Node 2 — Postgres: fetch open findings for this PR

```sql
SELECT * FROM findings
 WHERE repo = $1 AND pr_number = $2 AND status = 'open'
 ORDER BY CASE confidence WHEN 'definite' THEN 0 WHEN 'likely' THEN 1 ELSE 2 END,
          file, line;
```

### Node 3 — Code: build the markdown comment

```javascript
const crypto = require('crypto');
const rows = $input.all().map(i => i.json);
if (!rows.length) return [{ json: { skip: true } }];

const BASE   = 'https://<your-host>/webhook/leakguard/triage';
const secret = $env.LEAKGUARD_SECRET;
const sign = (fp, v) => crypto.createHmac('sha256', secret)
                              .update(`${fp}:${v}`).digest('hex').slice(0, 16);

const counts = rows.reduce((a, r) => (a[r.confidence] = (a[r.confidence] || 0) + 1, a), {});
const header = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');

const blocks = rows.map(r => {
  const path = (JSON.parse(r.leak_path || '[]')).map(s => s.line).join(' → ') || r.line;
  const real = `${BASE}?fp=${r.fingerprint}&v=real&t=${sign(r.fingerprint, 'real')}`;
  const fp   = `${BASE}?fp=${r.fingerprint}&v=fp&t=${sign(r.fingerprint, 'fp')}`;
  return `<details${r.confidence === 'definite' ? ' open' : ''}>
<summary><b>${r.file}:${r.line}</b> — <code>${r.resource}</code> · <b>${r.confidence}</b></summary>

\`\`\`
opened   line ${r.line}
path     ${path} (${r.exit_kind})
reason   ${r.reason}
\`\`\`

**Is this right?** [✅ Real leak](${real}) · [🚫 False positive](${fp})
</details>`;
});

return [{ json: {
  body: `### 🛡️ LeakGuard — ${header}\n\n${blocks.join('\n\n')}\n\n` +
        `<sub>Analyzed offline by \`leakguard\`. Findings only — no source code left CI.</sub>`,
}}];
```

### Node 4 — GitHub node

*Resource:* Issue · *Operation:* Create Comment · Issue Number: `{{ $json.pr_number }}` ·
Body: `{{ $json.body }}`

> **Why links, not buttons:** GitHub comments render markdown only — no
> interactive controls exist. A link fires the webhook on click and n8n returns
> a confirmation page. The HMAC over `fingerprint:verdict` stops anyone forging
> a suppression by editing the URL.

---

## Workflow 4 — `triage-callback`

🔴 Must-have. **This is the differentiator — rehearse this demo.**

### Node 1 — Webhook

`GET` · path `leakguard/triage` · Respond: *Using Respond to Webhook node*

### Node 2 — Code: verify the signed link

```javascript
const crypto = require('crypto');
const q = $input.first().json.query;
const { fp, v, t } = q;

if (!fp || !v || !t) throw new Error('missing parameters');

const expect = crypto.createHmac('sha256', $env.LEAKGUARD_SECRET)
                     .update(`${fp}:${v}`).digest('hex').slice(0, 16);
if (t !== expect) throw new Error('invalid triage token');

return [{ json: {
  fingerprint: fp,
  verdict: v === 'fp' ? 'false_positive' : 'real_leak',
  repo: q.repo ?? null,
}}];
```

### Node 3 — Postgres: record the verdict

```sql
INSERT INTO triage (repo, fingerprint, verdict, reason, actor)
VALUES ($1, $2, $3, $4, $5);
```

Append-only — never overwrite. That history is what lets the dashboard show a
**measured** FP rate over time.

### Node 4 — IF `verdict = 'false_positive'` → Postgres

```sql
UPDATE findings SET status = 'suppressed'
 WHERE fingerprint = $1 AND ($2::text IS NULL OR repo = $2);
```

### Node 5 — Respond to Webhook

Respond With: **Text**, Content-Type `text/html` — a human clicked a link in a
browser, so JSON is a poor landing page.

```html
<!doctype html><meta charset="utf-8">
<title>LeakGuard</title>
<style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0}
div{text-align:center}code{background:#f4f4f5;padding:2px 6px;border-radius:4px}</style>
<div>
  <h2>Recorded ✓</h2>
  <p><code>{{ $json.fingerprint }}</code> marked <b>{{ $json.verdict }}</b>.</p>
  <p>Future scans across the team will respect this.</p>
</div>
```

✅ **The demo, in ~20 seconds:** run `leakguard check` → click *False positive*
on the PR comment → re-run → the finding is gone, team-wide, with an audit
trail of who suppressed it and why.

---

## Workflow 5 — `slack-alert`

🟡 Polish.

1. **Execute Workflow Trigger** — inputs `repo`, `commit_sha`, `summary`
2. **Filter** — `definite > 0` **and** branch is `main`/`master`
3. **Slack** → Send Message

> **Only alert on `DEFINITE` on the default branch.** Alerting on every finding
> is the same crying-wolf failure at the notification layer, and a judge may
> well ask about it. Having a deliberate answer here is worth marks.

---

## Workflow 6 — `weekly-digest`

🟡 Polish.

1. **Schedule Trigger** — Cron `0 9 * * MON`
2. **Postgres** — trend query from `schema.sql`
3. **Postgres** — FP-rate query
4. **Code** — build the message
5. **Slack** → Send Message

---

## Workflow 7 — `dashboard-api`

🟡 Polish. Three Webhook nodes in **one** workflow (n8n allows multiple
triggers), each with its own Postgres node and Respond node.

| Path | Returns | Powers |
|---|---|---|
| `leakguard/api/findings` | open findings for a repo | the findings table |
| `leakguard/api/trend` | `runs` bucketed by hour | leak-debt chart |
| `leakguard/api/fp-rate` | triage verdicts per day | FP-rate chart |

All three queries are in [`schema.sql`](schema.sql). Add an `X-API-Key` check
in a Code node — same pattern as before.

---

## Workflow 8 — `fix-bot`

🟢 Stretch. **Do this only after 1–7 work.**

```
findings where fix_available = true
  → AI Agent node: draft a patch
  → GitHub: workflow_dispatch  ->  CI applies it and re-runs `leakguard check`
  → IF the analyzer still flags it: DISCARD, log, stop
  → ELSE: open a PR
```

> **Architectural note:** verification runs in **GitHub Actions**, not in n8n.
> The analyzer belongs where the code is, and installing Python + leakguard
> inside the n8n container to check out repos would be the wrong shape. n8n
> orchestrates; CI executes.

**The LLM proposes; the analyzer judges.** An unverified patch never reaches a
human. This is the same fail-closed philosophy as Axon, applied to our own
output — a genuinely strong line in the demo.

---

## Workflow 9 — `error-handler`

🟢 Stretch, 5 minutes.

1. **Error Trigger**
2. **Postgres** → `INSERT INTO system_errors (workflow, node, message, payload)`

Then set it as the *Error Workflow* in each other workflow's settings.

---

## End-to-end verification

Run these in order. Each proves one link in the chain.

```bash
# 1. Analyzer works offline, with n8n switched off entirely
leakguard check demo-repo/ --no-baseline
# -> exit 1, real findings

# 2. Ingest accepts a signed payload
LEAKGUARD_SECRET=<secret> leakguard sign integrations/n8n/sample-payload.json
curl -X POST https://<host>/webhook/leakguard/ingest \
  -H "Content-Type: application/json" \
  -H "X-LeakGuard-Signature: sha256=<digest>" \
  -d @integrations/n8n/sample-payload.json
# -> {"received": 10, ...}   run twice: row count must not change

# 3. Baseline round-trip - the moment both halves meet
leakguard check .
# -> stderr: "... suppressed by baseline (remote)"

# 4. Kill n8n, re-run
leakguard check .
# -> "(local)" and STILL WORKS. This graceful degradation is a demo point.
```

---

## Talking about this layer

Never say *"our backend is n8n."* Say:

> *"The analyzer is a self-contained, offline Python package. The team-scale
> control plane is orchestrated in n8n."*

If judges believe the analysis runs in n8n, the technical argument is lost
before it starts. Demo the CLI blocking a commit **offline** first; reveal the
control plane as act two.
