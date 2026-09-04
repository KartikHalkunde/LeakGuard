export type GateStatus = "passed" | "blocked";
export interface EmployeeRepositoryPerformance { repository: string; checks: number; cleanRate: number; errors: number; blocked: number }
export interface EmployeeRisk {
  login: string; name: string; avatar: string; scans: number; blocked: number; open: number; fixed: number;
  fixRate: number; cleanRate: number; avgFixHours: number; score: number; scoreDelta: number; cleanRateDelta: number;
  definite: number; likely: number; possible: number; repeats: number; topResource: string; repositories: EmployeeRepositoryPerformance[];
}
export interface RepositoryMember { login: string; checks: number; cleanRate: number; errors: number; blocked: number }
export interface RepositoryRisk { name: string; language: string; open: number; blockedPrs: number; scans: number; risk: "critical" | "high" | "low"; members: RepositoryMember[] }
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

export const organizationSnapshot: OrganizationSnapshot = {
  organization: "CodeBlooded Engineering", source: "demo", generatedAt: "2026-09-05T09:30:00.000Z",
  metrics: { employees: 4, repositories: 3, open: 12, blockedPrs: 3, fixRate: 76, scans: 47, cleanRate: 71, cleanRateDelta: 8, openDelta: -4 },
  employees: [
    { login: "nikita20", name: "Nikita", avatar: "N", scans: 15, blocked: 1, open: 2, fixed: 12, fixRate: 86, cleanRate: 80, avgFixHours: 1.2, score: 94, scoreDelta: 4, cleanRateDelta: 7, definite: 0, likely: 2, possible: 0, repeats: 0, topResource: "File / archive", repositories: [{ repository: "payments-api", checks: 9, cleanRate: 78, errors: 2, blocked: 1 }, { repository: "customer-portal", checks: 6, cleanRate: 83, errors: 0, blocked: 0 }] },
    { login: "kartik-h", name: "Kartik", avatar: "K", scans: 13, blocked: 0, open: 1, fixed: 9, fixRate: 90, cleanRate: 92, avgFixHours: 0.8, score: 97, scoreDelta: 2, cleanRateDelta: 3, definite: 0, likely: 0, possible: 1, repeats: 0, topResource: "HTTP session", repositories: [{ repository: "customer-portal", checks: 8, cleanRate: 100, errors: 0, blocked: 0 }, { repository: "data-workers", checks: 5, cleanRate: 80, errors: 1, blocked: 0 }] },
    { login: "dev-arjun", name: "Arjun", avatar: "A", scans: 11, blocked: 1, open: 3, fixed: 6, fixRate: 67, cleanRate: 64, avgFixHours: 4.5, score: 72, scoreDelta: -3, cleanRateDelta: -5, definite: 1, likely: 2, possible: 0, repeats: 1, topResource: "File handles", repositories: [{ repository: "data-workers", checks: 8, cleanRate: 63, errors: 3, blocked: 1 }, { repository: "payments-api", checks: 3, cleanRate: 67, errors: 0, blocked: 0 }] },
    { login: "dev-meera", name: "Meera", avatar: "M", scans: 8, blocked: 1, open: 6, fixed: 4, fixRate: 40, cleanRate: 38, avgFixHours: 8.1, score: 48, scoreDelta: -8, cleanRateDelta: -12, definite: 3, likely: 2, possible: 1, repeats: 2, topResource: "DB connections", repositories: [{ repository: "payments-api", checks: 7, cleanRate: 29, errors: 6, blocked: 1 }, { repository: "data-workers", checks: 1, cleanRate: 100, errors: 0, blocked: 0 }] },
  ],
  repositories: [
    { name: "payments-api", language: "Python", open: 7, blockedPrs: 2, scans: 19, risk: "critical", members: [{ login: "nikita20", checks: 9, cleanRate: 78, errors: 2, blocked: 1 }, { login: "dev-arjun", checks: 3, cleanRate: 67, errors: 0, blocked: 0 }, { login: "dev-meera", checks: 7, cleanRate: 29, errors: 6, blocked: 1 }] },
    { name: "data-workers", language: "Python", open: 4, blockedPrs: 1, scans: 16, risk: "high", members: [{ login: "kartik-h", checks: 5, cleanRate: 80, errors: 1, blocked: 0 }, { login: "dev-arjun", checks: 8, cleanRate: 63, errors: 3, blocked: 1 }, { login: "dev-meera", checks: 1, cleanRate: 100, errors: 0, blocked: 0 }] },
    { name: "customer-portal", language: "Python", open: 1, blockedPrs: 0, scans: 12, risk: "low", members: [{ login: "nikita20", checks: 6, cleanRate: 83, errors: 0, blocked: 0 }, { login: "kartik-h", checks: 8, cleanRate: 100, errors: 0, blocked: 0 }] },
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
