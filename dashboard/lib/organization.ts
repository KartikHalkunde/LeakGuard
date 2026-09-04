export type GateStatus = "passed" | "blocked";
export interface EmployeeRepositoryPerformance { repository: string; checks: number; cleanRate: number; errors: number; blocked: number }
export interface EmployeeRisk {
  login: string; name: string; avatar: string; scans: number; blocked: number; open: number; fixed: number;
  fixRate: number; cleanRate: number; avgFixHours: number; score: number; scoreDelta: number; cleanRateDelta: number;
  definite: number; likely: number; possible: number; repeats: number; topResource: string; repositories: EmployeeRepositoryPerformance[];
}
export interface RepositoryMember { login: string; checks: number; cleanRate: number; errors: number; blocked: number }
export interface RepositoryTeam { name: string; lead: string; members: string[]; cleanRate: number; open: number; blocked: number }
export interface RepositoryRisk { name: string; language: string; open: number; blockedPrs: number; scans: number; risk: "critical" | "high" | "low"; members: RepositoryMember[]; teams: RepositoryTeam[] }
export interface Incident {
  id: string; employee: string; repository: string; branch: string; pr: number; file: string; resource: string;
  confidence: "definite" | "likely" | "possible"; status: "open" | "fixed"; gate: GateStatus; detectedAt: string;
  reason: string; leakPath: string[]; runUrl?: string;
}
export interface DailySecurityPoint { date: string; accuracy: number; opened: number; fixed: number; blocked: number }
export interface OrganizationSnapshot {
  organization: string; source: "control-plane" | "demo"; generatedAt: string;
  metrics: { employees: number; repositories: number; open: number; blockedPrs: number; fixRate: number; scans: number; cleanRate: number; cleanRateDelta: number; openDelta: number };
  employees: EmployeeRisk[]; repositories: RepositoryRisk[]; incidents: Incident[]; trend: DailySecurityPoint[];
  pagination?: { page: number; pageSize: number; totalEmployees: number; totalRepositories: number; totalIncidents: number };
}

const baseOrganizationSnapshot: OrganizationSnapshot = {
  organization: "CodeBlooded Engineering", source: "demo", generatedAt: "2026-09-05T09:30:00.000Z",
  metrics: { employees: 4, repositories: 3, open: 12, blockedPrs: 3, fixRate: 76, scans: 47, cleanRate: 71, cleanRateDelta: 8, openDelta: -4 },
  employees: [
    { login: "nikita20", name: "Nikita", avatar: "N", scans: 15, blocked: 1, open: 2, fixed: 12, fixRate: 86, cleanRate: 80, avgFixHours: 1.2, score: 94, scoreDelta: 4, cleanRateDelta: 7, definite: 0, likely: 2, possible: 0, repeats: 0, topResource: "File / archive", repositories: [{ repository: "payments-api", checks: 9, cleanRate: 78, errors: 2, blocked: 1 }, { repository: "customer-portal", checks: 6, cleanRate: 83, errors: 0, blocked: 0 }] },
    { login: "kartik-h", name: "Kartik", avatar: "K", scans: 13, blocked: 0, open: 1, fixed: 9, fixRate: 90, cleanRate: 92, avgFixHours: 0.8, score: 97, scoreDelta: 2, cleanRateDelta: 3, definite: 0, likely: 0, possible: 1, repeats: 0, topResource: "HTTP session", repositories: [{ repository: "customer-portal", checks: 8, cleanRate: 100, errors: 0, blocked: 0 }, { repository: "data-workers", checks: 5, cleanRate: 80, errors: 1, blocked: 0 }] },
    { login: "dev-arjun", name: "Arjun", avatar: "A", scans: 11, blocked: 1, open: 3, fixed: 6, fixRate: 67, cleanRate: 64, avgFixHours: 4.5, score: 72, scoreDelta: -3, cleanRateDelta: -5, definite: 1, likely: 2, possible: 0, repeats: 1, topResource: "File handles", repositories: [{ repository: "data-workers", checks: 8, cleanRate: 63, errors: 3, blocked: 1 }, { repository: "payments-api", checks: 3, cleanRate: 67, errors: 0, blocked: 0 }] },
    { login: "dev-meera", name: "Meera", avatar: "M", scans: 8, blocked: 1, open: 6, fixed: 4, fixRate: 40, cleanRate: 38, avgFixHours: 8.1, score: 48, scoreDelta: -8, cleanRateDelta: -12, definite: 3, likely: 2, possible: 1, repeats: 2, topResource: "DB connections", repositories: [{ repository: "payments-api", checks: 7, cleanRate: 29, errors: 6, blocked: 1 }, { repository: "data-workers", checks: 1, cleanRate: 100, errors: 0, blocked: 0 }] },
  ],
  repositories: [
    { name: "payments-api", language: "Python", open: 7, blockedPrs: 2, scans: 19, risk: "critical", members: [{ login: "nikita20", checks: 9, cleanRate: 78, errors: 2, blocked: 1 }, { login: "dev-arjun", checks: 3, cleanRate: 67, errors: 0, blocked: 0 }, { login: "dev-meera", checks: 7, cleanRate: 29, errors: 6, blocked: 1 }], teams: [{ name: "Payments Platform", lead: "nikita20", members: ["nikita20", "dev-meera"], cleanRate: 57, open: 7, blocked: 2 }, { name: "API Reliability", lead: "dev-arjun", members: ["dev-arjun"], cleanRate: 67, open: 0, blocked: 0 }] },
    { name: "data-workers", language: "Python", open: 4, blockedPrs: 1, scans: 16, risk: "high", members: [{ login: "kartik-h", checks: 5, cleanRate: 80, errors: 1, blocked: 0 }, { login: "dev-arjun", checks: 8, cleanRate: 63, errors: 3, blocked: 1 }, { login: "dev-meera", checks: 1, cleanRate: 100, errors: 0, blocked: 0 }], teams: [{ name: "Data Processing", lead: "kartik-h", members: ["kartik-h", "dev-arjun"], cleanRate: 70, open: 4, blocked: 1 }, { name: "Data Quality", lead: "dev-meera", members: ["dev-meera"], cleanRate: 100, open: 0, blocked: 0 }] },
    { name: "customer-portal", language: "Python", open: 1, blockedPrs: 0, scans: 12, risk: "low", members: [{ login: "nikita20", checks: 6, cleanRate: 83, errors: 0, blocked: 0 }, { login: "kartik-h", checks: 8, cleanRate: 100, errors: 0, blocked: 0 }], teams: [{ name: "Customer Experience", lead: "kartik-h", members: ["kartik-h", "nikita20"], cleanRate: 92, open: 1, blocked: 0 }] },
  ],
  incidents: [
    { id: "LG-1042", employee: "dev-meera", repository: "payments-api", branch: "feat/refunds", pr: 84, file: "app/refunds.py:42", resource: "sqlite3.Connection", confidence: "definite", status: "open", gate: "blocked", detectedAt: "8 min ago", reason: "Early return at line 47 exits while conn is still open; close() at line 53 is unreachable on this path.", leakPath: ["L42 connection opened", "L46 refund not found", "L47 early return", "Exit with connection open"] },
    { id: "LG-1041", employee: "dev-arjun", repository: "data-workers", branch: "fix/export", pr: 31, file: "jobs/export.py:18", resource: "builtins.file", confidence: "likely", status: "open", gate: "blocked", detectedAt: "24 min ago", reason: "Parser exception can bypass handle.close(); the file remains open on the exception exit.", leakPath: ["L18 file opened", "L21 parser call may raise", "Exception exit skips L25 close"] },
    { id: "LG-1039", employee: "nikita20", repository: "payments-api", branch: "feat/archive", pr: 82, file: "app/archive.py:5", resource: "zipfile.ZipFile", confidence: "likely", status: "open", gate: "blocked", detectedAt: "1 hour ago", reason: "Disabled branch returns before archive.close(), leaving the archive descriptor open.", leakPath: ["L5 archive opened", "L6 disabled branch", "L7 return", "L8 close unreachable"] },
    { id: "LG-1037", employee: "kartik-h", repository: "customer-portal", branch: "chore/session", pr: 53, file: "api/session.py:11", resource: "requests.Session", confidence: "possible", status: "fixed", gate: "passed", detectedAt: "3 hours ago", reason: "Session ownership passed to an unresolved helper; manual review confirmed and fixed the close contract.", leakPath: ["L11 session opened", "L14 ownership passed", "L19 fixed in follow-up commit"] },
  ],
  trend: [
    { date: "Aug 30", accuracy: 58, opened: 9, fixed: 3, blocked: 5 }, { date: "Aug 31", accuracy: 61, opened: 7, fixed: 5, blocked: 4 },
    { date: "Sep 01", accuracy: 63, opened: 8, fixed: 6, blocked: 4 }, { date: "Sep 02", accuracy: 66, opened: 6, fixed: 7, blocked: 3 },
    { date: "Sep 03", accuracy: 64, opened: 8, fixed: 4, blocked: 4 }, { date: "Sep 04", accuracy: 68, opened: 5, fixed: 8, blocked: 3 },
    { date: "Today", accuracy: 71, opened: 4, fixed: 8, blocked: 3 },
  ],
};

const firstNames = ["Aarav", "Aditi", "Aisha", "Akash", "Ananya", "Arjun", "Dev", "Diya", "Ishaan", "Kabir", "Kavya", "Meera", "Neha", "Nikhil", "Priya", "Rahul", "Riya", "Rohan", "Saanvi", "Varun"];
const domains = ["payments", "identity", "orders", "analytics", "platform", "risk", "billing", "catalog", "support", "data", "notifications", "compliance"];
const services = ["api", "worker", "portal", "service", "pipeline", "gateway", "scheduler", "console", "engine", "automation"];

function buildLargeDemo(): OrganizationSnapshot {
  const repositories: RepositoryRisk[] = Array.from({ length: 120 }, (_, index) => {
    const name = `${domains[index % domains.length]}-${services[Math.floor(index / domains.length) % services.length]}${index >= domains.length * services.length ? `-${index + 1}` : ""}`;
    return { name, language: "Python", open: 0, blockedPrs: 0, scans: 0, risk: "low", members: [], teams: [] };
  });
  const employees: EmployeeRisk[] = Array.from({ length: 1200 }, (_, index) => {
    const login = `employee-${String(index + 1).padStart(4, "0")}`;
    const name = `${firstNames[index % firstNames.length]} ${String.fromCharCode(65 + Math.floor(index / firstNames.length) % 26)}.`;
    const open = index % 9;
    const scans = 8 + index % 34;
    const fixed = 3 + index % 24;
    const cleanRate = Math.max(28, 96 - open * 7 - index % 6);
    const repoIndexes = [index % repositories.length, (index * 7 + 11) % repositories.length];
    const repoPerformance = [...new Set(repoIndexes)].map((repoIndex, repoPosition) => {
      const checks = Math.max(2, Math.floor(scans / repoIndexes.length));
      const errors = repoPosition === 0 ? open : Math.floor(open / 3);
      const blocked = errors > 4 ? 1 : 0;
      repositories[repoIndex].members.push({ login, checks, cleanRate: Math.max(20, cleanRate - repoPosition * 3), errors, blocked });
      repositories[repoIndex].open += errors;
      repositories[repoIndex].blockedPrs += blocked;
      repositories[repoIndex].scans += checks;
      return { repository: repositories[repoIndex].name, checks, cleanRate: Math.max(20, cleanRate - repoPosition * 3), errors, blocked };
    });
    return { login, name, avatar: name[0], scans, blocked: open > 4 ? 1 : 0, open, fixed, fixRate: Math.round(fixed / Math.max(1, fixed + open) * 100), cleanRate, avgFixHours: Number((0.7 + open * 0.8).toFixed(1)), score: Math.max(35, cleanRate - open * 2), scoreDelta: index % 5 - 2, cleanRateDelta: index % 11 - 5, definite: Math.floor(open / 3), likely: Math.ceil(open / 2), possible: open - Math.floor(open / 3) - Math.ceil(open / 2), repeats: Math.floor(open / 4), topResource: ["File handles", "DB connections", "HTTP sessions", "Sockets"][index % 4], repositories: repoPerformance };
  });
  repositories.forEach((repo, repoIndex) => {
    repo.risk = repo.open > 55 ? "critical" : repo.open > 25 ? "high" : "low";
    const chunks = [repo.members.slice(0, 5), repo.members.slice(5, 10), repo.members.slice(10)];
    repo.teams = chunks.filter((members) => members.length).map((members, teamIndex) => ({ name: `${domains[repoIndex % domains.length]} ${["Core", "Reliability", "Delivery"][teamIndex]}`, lead: members[0].login, members: members.map((member) => member.login), cleanRate: Math.round(members.reduce((sum, member) => sum + member.cleanRate, 0) / members.length), open: members.reduce((sum, member) => sum + member.errors, 0), blocked: members.reduce((sum, member) => sum + member.blocked, 0) }));
  });
  const incidents: Incident[] = Array.from({ length: 2400 }, (_, index) => {
    const employee = employees[index % employees.length];
    const repository = employee.repositories[index % employee.repositories.length].repository;
    const confidence = (["definite", "likely", "possible"] as const)[index % 3];
    const blocked = confidence !== "possible" && index % 4 !== 0;
    return { id: `LG-${String(2000 + index)}`, employee: employee.login, repository, branch: `feature/work-${index + 1}`, pr: 100 + index, file: `src/module_${index % 80}.py:${10 + index % 90}`, resource: ["sqlite3.Connection", "builtins.file", "requests.Session", "socket.socket"][index % 4], confidence, status: index % 5 === 0 ? "fixed" : "open", gate: blocked ? "blocked" : "passed", detectedAt: `${1 + index % 59} min ago`, reason: `Resource remains open on the ${index % 2 ? "exception" : "early return"} path; cleanup is not reachable before function exit.`, leakPath: [`L${10 + index % 90} resource opened`, `L${12 + index % 90} branch taken`, `L${14 + index % 90} exit with resource open`] };
  });
  const scans = employees.reduce((sum, employee) => sum + employee.scans, 0);
  const open = incidents.filter((incident) => incident.status === "open").length;
  const blockedPrs = incidents.filter((incident) => incident.gate === "blocked").length;
  return { ...baseOrganizationSnapshot, generatedAt: new Date().toISOString(), metrics: { ...baseOrganizationSnapshot.metrics, employees: employees.length, repositories: repositories.length, open, blockedPrs, scans, fixRate: Math.round(incidents.filter((incident) => incident.status === "fixed").length / incidents.length * 100) }, employees, repositories, incidents };
}

export const organizationSnapshot: OrganizationSnapshot = buildLargeDemo();
