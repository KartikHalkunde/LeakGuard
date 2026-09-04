import { NextResponse } from "next/server";
import { organizationSnapshot } from "@/lib/organization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const repository = url.searchParams.get("repository") ?? "all";
  const employee = url.searchParams.get("employee") ?? "all";
  const range = url.searchParams.get("range") ?? "7d";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  const base = process.env.LEAKGUARD_CONTROL_PLANE_URL?.replace(/\/$/, "");
  if (base) {
    try {
      const controlPlaneQuery = new URLSearchParams({ search, repository, employee, range, page: String(page), pageSize: String(pageSize) });
      const response = await fetch(`${base}/organization/overview?${controlPlaneQuery}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${process.env.LEAKGUARD_DASHBOARD_TOKEN ?? ""}` },
        signal: AbortSignal.timeout(800), cache: "no-store",
      });
      if (response.ok) return NextResponse.json(await response.json());
    } catch { /* Offline-safe admin demo fallback. */ }
  }
  const searchTokens = search.split(/\s+/).filter(Boolean);
  const matchesSearch = (...values: string[]) => {
    if (!searchTokens.length) return true;
    const haystack = values.join(" ").toLowerCase();
    return searchTokens.every((token) => haystack.includes(token));
  };
  const employeeNames = new Map(organizationSnapshot.employees.map((item) => [item.login, item.name]));
  const searchableIncidents = organizationSnapshot.incidents.filter((item) =>
    matchesSearch(item.id, item.employee, employeeNames.get(item.employee) ?? "", item.repository, item.file, item.resource, item.reason)
  );
  const searchableIncidentIds = new Set(searchableIncidents.map((item) => item.id));
  const incidentEmployees = new Set(searchableIncidents.map((item) => item.employee));
  const incidentRepositories = new Set(searchableIncidents.map((item) => item.repository));
  const incidents = organizationSnapshot.incidents.filter((item) =>
    (repository === "all" || item.repository === repository) &&
    (employee === "all" || item.employee === employee) &&
    (!searchTokens.length || searchableIncidentIds.has(item.id))
  );
  const employees = organizationSnapshot.employees.filter((item) =>
    (employee === "all" || item.login === employee) &&
    (repository === "all" || item.repositories.some((entry) => entry.repository === repository)) &&
    (!searchTokens.length || matchesSearch(item.login, item.name, item.topResource, ...item.repositories.map((entry) => entry.repository)) || incidentEmployees.has(item.login))
  );
  const repositories = organizationSnapshot.repositories.filter((item) =>
    (repository === "all" || item.name === repository) &&
    (employee === "all" || item.members.some((member) => member.login === employee)) &&
    (!searchTokens.length || matchesSearch(item.name, item.language, ...item.teams.map((team) => team.name)) || incidentRepositories.has(item.name))
  );
  const start = (page - 1) * pageSize;
  return NextResponse.json({
    ...organizationSnapshot,
    trend: range === "today" ? organizationSnapshot.trend.slice(-1) : organizationSnapshot.trend,
    employees: employees.slice(start, start + pageSize),
    repositories: repositories.slice(start, start + pageSize),
    incidents: incidents.slice(start, start + pageSize),
    pagination: { page, pageSize, totalEmployees: employees.length, totalRepositories: repositories.length, totalIncidents: incidents.length },
  }, { headers: { "X-LeakGuard-Source": "demo", "Cache-Control": "private, max-age=15" } });
}
