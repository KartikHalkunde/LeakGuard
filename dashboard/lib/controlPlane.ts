import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./controlPlaneDb";
import type { OrganizationSnapshot, Incident, EmployeeRisk, RepositoryRisk } from "./organization";

type JsonObject = Record<string, unknown>;
type ScanPayload = { version?: string; summary?: JsonObject; findings?: JsonObject[]; context?: JsonObject };
type ScanRow = { id: number; repository: string; actor: string; branch: string; commit_sha: string | null; pr_number: number | null; run_url: string | null; gate_status: string; definite: number; likely: number; possible: number; total: number; payload: string; detected_at: string };
type RepoRow = { full_name: string; name: string; language: string };
type PersonRow = { login: string; name: string };
type MemberRow = { repository: string; login: string };
type WorkflowRow = { run_id: number; repository: string; actor: string; branch: string; workflow: string; status: string; conclusion: string | null; run_url: string | null; created_at: string };

function string(value: unknown, fallback = ""): string { return typeof value === "string" && value ? value : fallback; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

export function verifySignature(body: string, provided: string | null, secret = process.env.LEAKGUARD_SECRET): boolean {
  if (!secret || !provided) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const normalized = provided.replace(/^sha256=/, "");
  if (expected.length !== normalized.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
}

export function ingestScan(payload: ScanPayload): { stored: true; runKey: string } {
  const context = payload.context ?? {};
  const summary = payload.summary ?? {};
  const repository = string(context.repo, "unknown/unknown");
  const actor = string(context.actor, "unknown");
  const branch = string(context.branch, "unknown");
  const commit = string(context.commit);
  const runUrl = string(context.run_url);
  const runKey = runUrl || `${repository}:${commit || branch}:${string(context.gate_status)}:${number(summary.total)}`;
  const now = new Date().toISOString();
  const connection = db();
  connection.prepare(`INSERT INTO people(login,name,updated_at) VALUES(?,?,?)
    ON CONFLICT(login) DO UPDATE SET updated_at=excluded.updated_at`).run(actor, actor, now);
  connection.prepare(`INSERT INTO repositories(full_name,name,updated_at) VALUES(?,?,?)
    ON CONFLICT(full_name) DO UPDATE SET updated_at=excluded.updated_at`).run(repository, repository.split("/").at(-1) ?? repository, now);
  connection.prepare(`INSERT INTO repository_members(repository,login,updated_at) VALUES(?,?,?)
    ON CONFLICT(repository,login) DO UPDATE SET updated_at=excluded.updated_at`).run(repository, actor, now);
  connection.prepare(`INSERT INTO scans(run_key,repository,actor,branch,commit_sha,pr_number,run_url,gate_status,scan_mode,definite,likely,possible,total,payload,detected_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_key) DO UPDATE SET
    gate_status=excluded.gate_status, definite=excluded.definite, likely=excluded.likely,
    possible=excluded.possible, total=excluded.total, payload=excluded.payload, detected_at=excluded.detected_at`).run(
      runKey, repository, actor, branch, commit || null, number(context.pr_number) || null, runUrl || null,
      string(context.gate_status, number(summary.total) ? "blocked" : "passed"), string(context.scan_mode, "diff"),
      number(summary.definite), number(summary.likely), number(summary.possible), number(summary.total), JSON.stringify(payload), now,
    );
  return { stored: true, runKey };
}

export function upsertWorkflowRun(run: JsonObject, repository: string): void {
  const actor = (run.actor as JsonObject | undefined) ?? {};
  const login = string(actor.login, "github-actions");
  const now = new Date().toISOString();
  // Workflow events arrive before the periodic member inventory. Attribute the
  // run immediately so a new employee's first push is visible straight away.
  if (login !== "github-actions" && login !== "dependabot") upsertPerson(actor, repository);
  db().prepare(`INSERT INTO workflow_runs(run_id,repository,actor,branch,workflow,status,conclusion,run_url,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET status=excluded.status,conclusion=excluded.conclusion,updated_at=excluded.updated_at`).run(
      number(run.id), repository, login, string(run.head_branch, "unknown"), string(run.name, "GitHub Actions"),
      string(run.status, "unknown"), string(run.conclusion) || null, string(run.html_url) || null,
      string(run.created_at, now), string(run.updated_at, now),
    );
}

export function upsertRepository(repo: JsonObject): void {
  const fullName = string(repo.full_name);
  if (!fullName) return;
  db().prepare(`INSERT INTO repositories(full_name,name,language,html_url,private,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(full_name) DO UPDATE SET name=excluded.name,language=excluded.language,html_url=excluded.html_url,private=excluded.private,updated_at=excluded.updated_at`).run(
      fullName, string(repo.name, fullName.split("/").at(-1)), string(repo.language, "Unknown"), string(repo.html_url) || null,
      repo.private ? 1 : 0, string(repo.updated_at, new Date().toISOString()),
    );
}

export function upsertPerson(person: JsonObject, repository?: string): void {
  const login = string(person.login);
  if (!login) return;
  const now = new Date().toISOString();
  db().prepare(`INSERT INTO people(login,name,avatar_url,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(login) DO UPDATE SET name=excluded.name,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`).run(
      login, string(person.name, login), string(person.avatar_url) || null, now,
    );
  if (repository) db().prepare(`INSERT INTO repository_members(repository,login,updated_at) VALUES(?,?,?)
    ON CONFLICT(repository,login) DO UPDATE SET updated_at=excluded.updated_at`).run(repository, login, now);
}

function sinceFor(range: string): Date {
  const days = range === "today" ? 1 : Math.max(1, Number.parseInt(range, 10) || 7);
  return new Date(Date.now() - days * 86_400_000);
}

export function buildOrganizationSnapshot(filters: { range: string; search: string; repository: string; employee: string; page: number; pageSize: number }): OrganizationSnapshot {
  const connection = db();
  const since = sinceFor(filters.range).toISOString();
  const scans = connection.prepare("SELECT * FROM scans WHERE detected_at >= ? ORDER BY detected_at DESC").all(since) as unknown as ScanRow[];
  const repoRows = connection.prepare("SELECT full_name,name,language FROM repositories ORDER BY name").all() as unknown as RepoRow[];
  const people = connection.prepare("SELECT login,name FROM people ORDER BY login").all() as unknown as PersonRow[];
  const memberships = connection.prepare("SELECT repository,login FROM repository_members").all() as unknown as MemberRow[];
  const workflows = connection.prepare("SELECT run_id,repository,actor,branch,workflow,status,conclusion,run_url,created_at FROM workflow_runs WHERE created_at >= ? ORDER BY created_at DESC").all(since) as unknown as WorkflowRow[];
  const scanRunUrls = new Set(scans.map((scan) => scan.run_url).filter((url): url is string => Boolean(url)));
  // A signed LeakGuard report is the richest source of truth. GitHub workflow
  // results fill the gap when a report has not reached the control plane yet,
  // so an employee can never appear 100% accurate with zero recorded checks.
  const workflowChecks = workflows.filter((run) => (run.conclusion === "success" || run.conclusion === "failure") && (!run.run_url || !scanRunUrls.has(run.run_url)));
  const checkStats = (actor?: string, repository?: string) => {
    const reportChecks = scans.filter((scan) => (!actor || scan.actor === actor) && (!repository || scan.repository === repository));
    const workflowOnly = workflowChecks.filter((run) => (!actor || run.actor === actor) && (!repository || run.repository === repository));
    const passed = reportChecks.filter((scan) => scan.gate_status === "passed").length + workflowOnly.filter((run) => run.conclusion === "success").length;
    return { total: reportChecks.length + workflowOnly.length, passed, blocked: reportChecks.filter((scan) => scan.gate_status !== "passed").length + workflowOnly.filter((run) => run.conclusion === "failure").length };
  };
  const names = new Map(people.map((person) => [person.login, person.name]));
  const latestScopeScan = new Map<string, number>();
  for (const scan of scans) {
    const scope = `${scan.repository}:${scan.actor}:${scan.branch}`;
    if (!latestScopeScan.has(scope)) latestScopeScan.set(scope, scan.id);
  }
  const incidentMap = new Map<string, Incident>();
  for (const scan of scans) {
    let parsed: ScanPayload = {};
    try { parsed = JSON.parse(scan.payload) as ScanPayload; } catch { continue; }
    (parsed.findings ?? []).forEach((finding, index) => {
      const fingerprint = string(finding.fingerprint, `${string(finding.file)}:${number(((finding.acquired_at as JsonObject | undefined) ?? {}).line)}:${string(finding.resource)}`);
      const incidentKey = `${scan.repository}:${scan.actor}:${scan.branch}:${fingerprint}`;
      if (incidentMap.has(incidentKey)) return;
      const acquired = (finding.acquired_at as JsonObject | undefined) ?? {};
      const path = Array.isArray(finding.leak_path) ? finding.leak_path as JsonObject[] : [];
      const isCurrent = latestScopeScan.get(`${scan.repository}:${scan.actor}:${scan.branch}`) === scan.id;
      incidentMap.set(incidentKey, {
        id: `LG-${scan.id}-${index + 1}`, employee: scan.actor, repository: scan.repository, branch: scan.branch,
        pr: scan.pr_number ?? 0, file: `${string(finding.file, "unknown")}:${number(acquired.line)}`,
        resource: string(finding.resource, "resource"), confidence: string(finding.confidence, "possible") as Incident["confidence"],
        status: isCurrent ? "open" : "fixed", gate: isCurrent && scan.gate_status === "blocked" ? "blocked" : "passed",
        detectedAt: scan.detected_at, reason: string(finding.reason, "Resource cleanup is missing on a reachable path."),
        leakPath: path.map((step) => `L${number(step.line)} ${string(step.note)}`), runUrl: scan.run_url ?? undefined,
      });
    });
  }
  const incidents = [...incidentMap.values()];
  const repoNames = new Set([...repoRows.map((repo) => repo.full_name), ...scans.map((scan) => scan.repository)]);
  const employeeNames = new Set([...people.map((person) => person.login), ...scans.map((scan) => scan.actor), ...workflowChecks.map((run) => run.actor)]);
  const employeeRows: EmployeeRisk[] = [...employeeNames].map((login) => {
    const mine = scans.filter((scan) => scan.actor === login);
    const mineIncidents = incidents.filter((incident) => incident.employee === login);
    const mineOpen = mineIncidents.filter((incident) => incident.status === "open");
    const mineFixed = mineIncidents.length - mineOpen.length;
    const repos = [...new Set([...memberships.filter((member) => member.login === login).map((member) => member.repository), ...mine.map((scan) => scan.repository), ...workflowChecks.filter((run) => run.actor === login).map((run) => run.repository)])];
    const stats = checkStats(login);
    const repositories = repos.map((repository) => { const checks = checkStats(login, repository); const errors = mineIncidents.filter((incident) => incident.repository === repository).length; return { repository, checks: checks.total, cleanRate: checks.total ? Math.round(checks.passed / checks.total * 100) : 0, errors, blocked: checks.blocked }; });
    const cleanRate = stats.total ? Math.round(stats.passed / stats.total * 100) : 0;
    return { login, name: names.get(login) ?? login, avatar: login[0]?.toUpperCase() ?? "?", scans: stats.total, blocked: stats.blocked, open: mineOpen.length, fixed: mineFixed, fixRate: mineIncidents.length ? Math.round(mineFixed / mineIncidents.length * 100) : 100, cleanRate, avgFixHours: 0, score: stats.total ? Math.max(0, cleanRate - mineOpen.length * 2) : 0, scoreDelta: 0, cleanRateDelta: 0, definite: mineOpen.filter((i) => i.confidence === "definite").length, likely: mineOpen.filter((i) => i.confidence === "likely").length, possible: mineOpen.filter((i) => i.confidence === "possible").length, repeats: Math.max(0, mineIncidents.length - new Set(mineIncidents.map((i) => i.resource)).size), topResource: mineOpen[0]?.resource ?? "None", repositories };
  });
  const activity = workflows.map((run) => ({ repository: run.repository, id: run.run_id, employee: run.actor, branch: run.branch, workflow: run.workflow, status: run.status, conclusion: run.conclusion ?? "pending", createdAt: run.created_at, runUrl: run.run_url ?? undefined }));
  const repositoryRows: RepositoryRisk[] = [...repoNames].map((fullName) => {
    const row = repoRows.find((repo) => repo.full_name === fullName); const repoScans = scans.filter((scan) => scan.repository === fullName); const repoIncidents = incidents.filter((incident) => incident.repository === fullName);
    const memberLogins = [...new Set([...memberships.filter((member) => member.repository === fullName).map((member) => member.login), ...repoScans.map((scan) => scan.actor), ...workflowChecks.filter((run) => run.repository === fullName).map((run) => run.actor)])];
    const members = memberLogins.map((login) => { const checks = checkStats(login, fullName); const errors = repoIncidents.filter((incident) => incident.employee === login).length; return { login, checks: checks.total, cleanRate: checks.total ? Math.round(checks.passed / checks.total * 100) : 0, errors, blocked: checks.blocked }; });
    const repoStats = checkStats(undefined, fullName); const open = repoIncidents.filter((incident) => incident.status === "open").length; const measuredMembers = members.filter((member) => member.checks); return { name: fullName, language: row?.language ?? "Unknown", open, blockedPrs: repoStats.blocked, scans: repoStats.total, risk: open > 10 ? "critical" : open ? "high" : "low", members, teams: members.length ? [{ name: "Repository contributors", lead: members[0].login, members: members.map((m) => m.login), cleanRate: measuredMembers.length ? Math.round(measuredMembers.reduce((s,m) => s + m.cleanRate, 0) / measuredMembers.length) : 0, open, blocked: repoStats.blocked }] : [], activity: activity.filter((entry) => entry.repository === fullName) };
  });
  const tokens = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (...values: string[]) => !tokens.length || tokens.every((token) => values.join(" ").toLowerCase().includes(token));
  const filteredIncidents = incidents.filter((item) => (filters.repository === "all" || item.repository === filters.repository) && (filters.employee === "all" || item.employee === filters.employee) && match(item.employee, item.repository, item.file, item.resource, item.reason));
  const filteredEmployees = employeeRows.filter((item) => (filters.employee === "all" || item.login === filters.employee) && (filters.repository === "all" || item.repositories.some((repo) => repo.repository === filters.repository)) && match(item.login, item.name, item.topResource, ...item.repositories.map((repo) => repo.repository)));
  const filteredRepos = repositoryRows.filter((item) => (filters.repository === "all" || item.name === filters.repository) && (filters.employee === "all" || item.members.some((member) => member.login === filters.employee)) && match(item.name, item.language));
  const start = (filters.page - 1) * filters.pageSize;
  const dayMap = new Map<string, { opened: number; fixed: number; blocked: number; scans: number; passed: number }>();
  for (const scan of scans) { const date = scan.detected_at.slice(0, 10); const point = dayMap.get(date) ?? { opened: 0, fixed: 0, blocked: 0, scans: 0, passed: 0 }; point.opened += scan.total; point.blocked += scan.gate_status === "blocked" ? 1 : 0; point.scans += 1; point.passed += scan.gate_status === "passed" ? 1 : 0; dayMap.set(date, point); }
  const trend = [...dayMap.entries()].sort().map(([date, point]) => ({ date, opened: point.opened, fixed: point.fixed, blocked: point.blocked, accuracy: point.scans ? Math.round(point.passed / point.scans * 100) : 100 }));
  const allStats = checkStats();
  const blocked = allStats.blocked;
  const passed = allStats.passed;
  const openIncidents = incidents.filter((incident) => incident.status === "open").length;
  const fixedIncidents = incidents.length - openIncidents;
  return { organization: process.env.LEAKGUARD_GITHUB_ORG ?? repoRows[0]?.full_name.split("/")[0] ?? "LeakGuard Organization", source: "control-plane", generatedAt: new Date().toISOString(), metrics: { employees: employeeRows.length, repositories: repositoryRows.length, open: openIncidents, blockedPrs: blocked, fixRate: incidents.length ? Math.round(fixedIncidents / incidents.length * 100) : 100, scans: allStats.total, cleanRate: allStats.total ? Math.round(passed / allStats.total * 100) : 0, cleanRateDelta: 0, openDelta: 0, githubFailures: workflows.filter((run) => run.conclusion === "failure").length }, employees: filteredEmployees.slice(start, start + filters.pageSize), repositories: filteredRepos.slice(start, start + filters.pageSize), incidents: filteredIncidents.slice(start, start + filters.pageSize), trend, pagination: { page: filters.page, pageSize: filters.pageSize, totalEmployees: filteredEmployees.length, totalRepositories: filteredRepos.length, totalIncidents: filteredIncidents.length } };
}
