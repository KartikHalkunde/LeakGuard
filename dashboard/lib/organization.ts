export type GateStatus = "passed" | "blocked";

export interface EmployeeRisk {
  login: string; name: string; avatar: string; scans: number; blocked: number;
  open: number; fixed: number; fixRate: number; cleanRate: number; avgFixHours: number; score: number;
  definite: number; likely: number; possible: number; repeats: number; topResource: string;
}
export interface RepositoryRisk {
  name: string; language: string; open: number; blockedPrs: number; scans: number; risk: "critical" | "high" | "low";
}
export interface Incident {
  id: string; employee: string; repository: string; branch: string; pr: number;
  file: string; resource: string; confidence: "definite" | "likely" | "possible";
  status: "open" | "fixed"; gate: GateStatus; detectedAt: string; runUrl?: string;
}
export interface OrganizationSnapshot {
  organization: string; source: "control-plane" | "demo"; generatedAt: string;
  metrics: { employees: number; repositories: number; open: number; blockedPrs: number; fixRate: number; scans: number };
  employees: EmployeeRisk[]; repositories: RepositoryRisk[]; incidents: Incident[];
}

export const organizationSnapshot: OrganizationSnapshot = {
  organization: "CodeBlooded Engineering",
  source: "demo",
  generatedAt: "2026-09-05T09:30:00.000Z",
  metrics: { employees: 4, repositories: 3, open: 12, blockedPrs: 3, fixRate: 76, scans: 47 },
  employees: [
    { login: "nikita20", name: "Nikita", avatar: "N", scans: 15, blocked: 1, open: 2, fixed: 12, fixRate: 86, cleanRate: 80, avgFixHours: 1.2, score: 94, definite: 0, likely: 2, possible: 0, repeats: 0, topResource: "File / archive" },
    { login: "kartik-h", name: "Kartik", avatar: "K", scans: 13, blocked: 0, open: 1, fixed: 9, fixRate: 90, cleanRate: 92, avgFixHours: 0.8, score: 97, definite: 0, likely: 0, possible: 1, repeats: 0, topResource: "HTTP session" },
    { login: "dev-arjun", name: "Arjun", avatar: "A", scans: 11, blocked: 1, open: 3, fixed: 6, fixRate: 67, cleanRate: 64, avgFixHours: 4.5, score: 72, definite: 1, likely: 2, possible: 0, repeats: 1, topResource: "File handles" },
    { login: "dev-meera", name: "Meera", avatar: "M", scans: 8, blocked: 1, open: 6, fixed: 4, fixRate: 40, cleanRate: 38, avgFixHours: 8.1, score: 48, definite: 3, likely: 2, possible: 1, repeats: 2, topResource: "DB connections" },
  ],
  repositories: [
    { name: "payments-api", language: "Python", open: 7, blockedPrs: 2, scans: 19, risk: "critical" },
    { name: "data-workers", language: "Python", open: 4, blockedPrs: 1, scans: 16, risk: "high" },
    { name: "customer-portal", language: "Python", open: 1, blockedPrs: 0, scans: 12, risk: "low" },
  ],
  incidents: [
    { id: "LG-1042", employee: "dev-meera", repository: "payments-api", branch: "feat/refunds", pr: 84, file: "app/refunds.py:42", resource: "sqlite3.Connection", confidence: "definite", status: "open", gate: "blocked", detectedAt: "8 min ago" },
    { id: "LG-1041", employee: "dev-arjun", repository: "data-workers", branch: "fix/export", pr: 31, file: "jobs/export.py:18", resource: "builtins.file", confidence: "likely", status: "open", gate: "blocked", detectedAt: "24 min ago" },
    { id: "LG-1039", employee: "nikita20", repository: "payments-api", branch: "feat/archive", pr: 82, file: "app/archive.py:5", resource: "zipfile.ZipFile", confidence: "likely", status: "open", gate: "blocked", detectedAt: "1 hour ago" },
    { id: "LG-1037", employee: "kartik-h", repository: "customer-portal", branch: "chore/session", pr: 53, file: "api/session.py:11", resource: "requests.Session", confidence: "possible", status: "fixed", gate: "passed", detectedAt: "3 hours ago" },
  ],
};
