-- LeakGuard control plane schema (Postgres / Supabase)
--
-- This database holds FINDINGS ONLY. It never stores source code.
-- A row is: which repo, which file, which line, which resource type, and a
-- content-based fingerprint. That is enough to track, triage and trend
-- without exfiltrating anyone's code.

-- ---------------------------------------------------------------------------
-- findings: current state, one row per (repo, fingerprint)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS findings (
    id           BIGSERIAL PRIMARY KEY,
    fingerprint  TEXT        NOT NULL,
    repo         TEXT        NOT NULL,
    branch       TEXT,
    commit_sha   TEXT,
    pr_number    INTEGER,
    confidence   TEXT        NOT NULL CHECK (confidence IN
                             ('definite','likely','possible','safe')),
    resource     TEXT        NOT NULL,
    file         TEXT        NOT NULL,
    function     TEXT,
    line         INTEGER,
    variable     TEXT,
    reason       TEXT,
    exit_kind    TEXT,
    severity     TEXT        DEFAULT 'medium',
    fix_available BOOLEAN    DEFAULT FALSE,
    leak_path    JSONB       DEFAULT '[]'::jsonb,
    status       TEXT        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','fixed','suppressed')),
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT findings_repo_fingerprint_key UNIQUE (repo, fingerprint)
);

CREATE INDEX IF NOT EXISTS findings_repo_status_idx  ON findings (repo, status);
CREATE INDEX IF NOT EXISTS findings_confidence_idx   ON findings (repo, confidence);
CREATE INDEX IF NOT EXISTS findings_pr_idx           ON findings (repo, pr_number);

-- ---------------------------------------------------------------------------
-- triage: the human feedback loop -- the differentiator
--
-- Every verdict is appended, never overwritten, so the dashboard can show a
-- measured false-positive rate declining over time, with attribution.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS triage (
    id           BIGSERIAL PRIMARY KEY,
    fingerprint  TEXT        NOT NULL,
    repo         TEXT        NOT NULL,
    verdict      TEXT        NOT NULL CHECK (verdict IN
                             ('real_leak','false_positive')),
    reason       TEXT,
    actor        TEXT,
    source       TEXT        DEFAULT 'pr_comment',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS triage_repo_fp_idx ON triage (repo, fingerprint);

-- ---------------------------------------------------------------------------
-- runs: one row per CI scan -- powers the leak-debt-over-time chart
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
    id           BIGSERIAL PRIMARY KEY,
    repo         TEXT        NOT NULL,
    branch       TEXT,
    commit_sha   TEXT,
    pr_number    INTEGER,
    actor        TEXT,
    event        TEXT,
    base_sha     TEXT,
    run_url      TEXT,
    gate_status  TEXT        CHECK (gate_status IN ('passed','blocked','error')),
    definite     INTEGER     NOT NULL DEFAULT 0,
    likely       INTEGER     NOT NULL DEFAULT 0,
    possible     INTEGER     NOT NULL DEFAULT 0,
    total        INTEGER     NOT NULL DEFAULT 0,
    files        INTEGER     NOT NULL DEFAULT 0,
    duration_ms  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_repo_created_idx ON runs (repo, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_actor_created_idx ON runs (actor, created_at DESC);

-- ---------------------------------------------------------------------------
-- system_errors: global n8n error-trigger sink (same pattern as Axon)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_errors (
    id           BIGSERIAL PRIMARY KEY,
    workflow     TEXT,
    node         TEXT,
    message      TEXT,
    payload      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ===========================================================================
-- Queries the n8n workflows use. Paste these into Postgres nodes.
-- ===========================================================================

-- [ingest-findings] UPSERT one finding
--   $1 repo  $2 fingerprint  $3 confidence  $4 resource  $5 file
--   $6 function  $7 line  $8 variable  $9 reason  $10 exit_kind
--   $11 severity  $12 fix_available  $13 leak_path  $14 branch
--   $15 commit_sha  $16 pr_number
--
-- INSERT INTO findings (repo, fingerprint, confidence, resource, file,
--                       function, line, variable, reason, exit_kind,
--                       severity, fix_available, leak_path, branch,
--                       commit_sha, pr_number)
-- VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
-- ON CONFLICT (repo, fingerprint) DO UPDATE SET
--     last_seen  = now(),
--     confidence = EXCLUDED.confidence,
--     line       = EXCLUDED.line,
--     reason     = EXCLUDED.reason,
--     leak_path  = EXCLUDED.leak_path,
--     commit_sha = EXCLUDED.commit_sha,
--     pr_number  = EXCLUDED.pr_number,
--     status     = CASE WHEN findings.status = 'suppressed'
--                       THEN 'suppressed' ELSE 'open' END;
--
-- Note the CASE: a re-scan must never resurrect a suppressed finding.
-- That is what makes the ratchet hold.


-- [ingest-findings] close out findings this scan did not report
-- UPDATE findings SET status = 'fixed', last_seen = now()
--  WHERE repo = $1
--    AND status = 'open'
--    AND NOT (fingerprint = ANY($2::text[]));


-- [triage-callback] record a verdict
-- INSERT INTO triage (repo, fingerprint, verdict, reason, actor)
-- VALUES ($1, $2, $3, $4, $5);

-- [triage-callback] suppress on a false positive
-- UPDATE findings SET status = 'suppressed'
--  WHERE repo = $1 AND fingerprint = $2;


-- [GET /baseline] the shared, team-wide suppression list
-- SELECT json_build_object(
--     'version', 1,
--     'created', now(),
--     'suppressed', COALESCE(json_agg(json_build_object(
--         'fingerprint', f.fingerprint,
--         'reason',      COALESCE(t.reason, 'suppressed'),
--         'file',        f.file,
--         'function',    f.function,
--         'at',          f.last_seen
--     )), '[]'::json)
-- ) AS baseline
-- FROM findings f
-- LEFT JOIN LATERAL (
--     SELECT reason FROM triage
--      WHERE triage.repo = f.repo AND triage.fingerprint = f.fingerprint
--      ORDER BY created_at DESC LIMIT 1
-- ) t ON TRUE
-- WHERE f.repo = $1 AND f.status = 'suppressed';


-- [GET /trend] leak debt over time -- the "why we keep it on" chart
-- SELECT date_trunc('hour', created_at) AS bucket,
--        MAX(definite) AS definite,
--        MAX(likely)   AS likely,
--        MAX(total)    AS total
--   FROM runs
--  WHERE repo = $1 AND created_at > now() - interval '30 days'
--  GROUP BY bucket ORDER BY bucket;


-- [GET /fp-rate] measured false-positive rate, per day
-- SELECT date_trunc('day', created_at) AS day,
--        COUNT(*) FILTER (WHERE verdict = 'false_positive')::float
--          / NULLIF(COUNT(*), 0) AS fp_rate,
--        COUNT(*) AS triaged
--   FROM triage
--  WHERE repo = $1
--  GROUP BY day ORDER BY day;
