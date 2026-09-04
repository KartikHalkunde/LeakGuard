"use client";

import { useEffect, useMemo, useState } from "react";
import { organizationSnapshot, type OrganizationSnapshot } from "@/lib/organization";

type View = "overview" | "employees" | "repositories" | "incidents";

function useOrganization() {
  const [data, setData] = useState(organizationSnapshot);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void fetch("/api/organization").then((r) => r.ok ? r.json() : Promise.reject()).then(setData).finally(() => setLoading(false)); }, []);
  return { data, loading };
}

function Metrics({ data }: { data: OrganizationSnapshot }) {
  const items = [["Employees", data.metrics.employees], ["Repositories", data.metrics.repositories], ["Open incidents", data.metrics.open], ["Blocked PRs", data.metrics.blockedPrs], ["Fix rate", `${data.metrics.fixRate}%`], ["CI scans", data.metrics.scans]];
  return <section className="admin-metrics">{items.map(([label, value]) => <div className="admin-stat" key={label}><small>{label}</small><b>{value}</b></div>)}</section>;
}

function EmployeeTable({ data, compact = false }: { data: OrganizationSnapshot; compact?: boolean }) {
  const employees = useMemo(() => [...data.employees].sort((a, b) => b.score - a.score), [data]);
  return <section className="admin-card"><div className="admin-card-head"><div><span className="panel-kicker">Team security performance</span><h2>{compact ? "Employee risk leaderboard" : "All employees"}</h2></div><span className="admin-help">Accuracy = clean PR checks / total PR checks</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Rank / employee</th><th>Security score</th><th>Clean accuracy</th><th>D / L / P errors</th><th>Blocked PRs</th><th>Fix rate</th><th>Avg fix</th></tr></thead><tbody>{employees.map((employee, index) => <tr key={employee.login}><td><span className="rank">#{index + 1}</span><span className="avatar">{employee.avatar}</span><strong>{employee.name}<small>@{employee.login} · {employee.scans} checks</small></strong></td><td><b className={employee.score < 60 ? "danger-text" : "good-text"}>{employee.score}</b><span className="score-track"><i style={{ width: `${employee.score}%` }}/></span></td><td><b className={employee.cleanRate < 60 ? "danger-text" : "good-text"}>{employee.cleanRate}%</b></td><td><span className="severity-count definite">{employee.definite}</span><span className="severity-count likely">{employee.likely}</span><span className="severity-count possible">{employee.possible}</span></td><td>{employee.blocked}</td><td>{employee.fixRate}%<small>{employee.fixed} fixed</small></td><td>{employee.avgFixHours}h</td></tr>)}</tbody></table></div></section>;
}

function EmployeeBreakdown({ data }: { data: OrganizationSnapshot }) {
  return <section className="employee-grid">{[...data.employees].sort((a, b) => a.score - b.score).map((employee) => {
    const incidents = data.incidents.filter((item) => item.employee === employee.login);
    return <article className="employee-detail" key={employee.login}><header><span className="avatar">{employee.avatar}</span><div><strong>{employee.name}</strong><small>@{employee.login}</small></div><b className={employee.score < 60 ? "danger-text" : "good-text"}>{employee.score}/100</b></header><div className="employee-kpis"><span><b>{employee.cleanRate}%</b><small>clean accuracy</small></span><span><b>{employee.repeats}</b><small>repeat leaks</small></span><span><b>{employee.avgFixHours}h</b><small>mean fix time</small></span></div><p>Top error category <strong>{employee.topResource}</strong></p><div className="employee-errors"><span className="definite">{employee.definite} definite</span><span className="likely">{employee.likely} likely</span><span className="possible">{employee.possible} possible</span></div><footer>{incidents.length ? incidents.map((incident) => <small key={incident.id}>{incident.id} · {incident.resource} · PR #{incident.pr}</small>) : <small>No recent attributed incidents</small>}</footer></article>;
  })}</section>;
}

function RepoGrid({ data }: { data: OrganizationSnapshot }) {
  return <section className="repo-risk-grid">{data.repositories.map((repo) => <article className={`repo-risk ${repo.risk}`} key={repo.name}><div><span className="repo-symbol">R</span><span><strong>{repo.name}</strong><small>{repo.language} · {repo.scans} incremental scans</small></span></div><b>{repo.open}<small>open incidents</small></b><footer><span>{repo.blockedPrs} PRs blocked</span><em>{repo.risk} risk</em></footer></article>)}</section>;
}

function IncidentTable({ data, limit }: { data: OrganizationSnapshot; limit?: number }) {
  const incidents = limit ? data.incidents.slice(0, limit) : data.incidents;
  return <section className="admin-card"><div className="admin-card-head"><div><span className="panel-kicker">GitHub enforcement</span><h2>Recent incidents</h2></div><span className="admin-help">Only changed Python files scanned</span></div><div className="admin-table-wrap"><table className="admin-table incident-table"><thead><tr><th>Incident</th><th>Employee / repository</th><th>Finding</th><th>Pull request</th><th>Gate</th></tr></thead><tbody>{incidents.map((incident) => <tr key={incident.id}><td><strong>{incident.id}</strong><small>{incident.detectedAt}</small></td><td><strong>@{incident.employee}</strong><small>{incident.repository} · {incident.branch}</small></td><td><span className={`severity ${incident.confidence}`}>{incident.confidence}</span><strong>{incident.resource}</strong><small>{incident.file}</small></td><td>#{incident.pr}</td><td><span className={`gate ${incident.gate}`}>{incident.gate === "blocked" ? "× Merge blocked" : "✓ Merge allowed"}</span></td></tr>)}</tbody></table></div></section>;
}

export function AdminDashboard({ view }: { view: View }) {
  const { data, loading } = useOrganization();
  const titles = { overview: ["Organization command center", "Security posture across every employee, repository and protected pull request."], employees: ["Employee security", "Compare exact leak types, clean-check accuracy and remediation performance."], repositories: ["Repository risk", "Prioritize repositories carrying the highest unresolved resource-leak debt."], incidents: ["Leak incidents", "Audit every finding attributed to its employee, branch, commit and pull request."] };
  return <>{loading && <div className="admin-loading"><i/> Syncing organization data</div>}<div className="admin-top"><div><span className="eyebrow">LeakGuard Organization</span><h1 className="page-title">{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="org-chip"><span>CB</span><strong>{data.organization}<small>{data.source === "control-plane" ? "Live control plane" : "Demo organization data"}</small></strong></div></div>{view === "overview" && <><Metrics data={data}/><div className="admin-section-title"><h2>Repository exposure</h2><span>Updated from GitHub Actions</span></div><RepoGrid data={data}/><EmployeeTable data={data} compact/><IncidentTable data={data} limit={3}/></>}{view === "employees" && <><Metrics data={data}/><EmployeeTable data={data}/><EmployeeBreakdown data={data}/></>}{view === "repositories" && <><Metrics data={data}/><RepoGrid data={data}/></>}{view === "incidents" && <><Metrics data={data}/><IncidentTable data={data}/></>}</>;
}
