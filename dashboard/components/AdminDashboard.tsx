"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { emptyOrganizationSnapshot, type OrganizationSnapshot } from "@/lib/organization";
import { LineChart } from "./LineChart";

type View = "overview" | "employees" | "repositories" | "incidents";

/** Single source of truth for the poll cadence and the label that advertises it. */
const REFRESH_MS = 15_000;

function useOrganization(filters: { range: string; search: string; repository: string; employee: string }, page: number, pageSize: number) {
  const [data, setData] = useState<OrganizationSnapshot>(() => ({ ...emptyOrganizationSnapshot, pagination: { ...emptyOrganizationSnapshot.pagination!, pageSize } }));
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefresh = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    // Background polls refresh the data silently. Flagging them as loading put
    // the "Syncing organization data" banner on screen every couple of seconds
    // and repainted every chart under it, which read as a page that could not
    // settle rather than one that was up to date.
    const load = (force = false, background = false) => {
      const query = new URLSearchParams({ ...filters, page: String(page), pageSize: String(pageSize) });
      if (force) query.set("refresh", "1");
      if (!background) setLoading(true);
      void fetch(`/api/organization?${query}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error("Organization request failed")))
        .then(setData)
        .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error); })
        .finally(() => { if (!controller.signal.aborted && !background) setLoading(false); });
    };
    const shouldForce = forceRefresh.current;
    forceRefresh.current = false;
    const timer = window.setTimeout(() => load(shouldForce), 200);
    const poll = window.setInterval(() => load(false, true), REFRESH_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); controller.abort(); };
  }, [filters.range, filters.search, filters.repository, filters.employee, page, pageSize, refreshKey]);
  return { data, loading, refresh: () => { forceRefresh.current = true; setRefreshKey((value) => value + 1); } };
}

function FilterBar({ data, filters, setFilters }: { data: OrganizationSnapshot; filters: { range: string; search: string; repository: string; employee: string }; setFilters: (next: typeof filters) => void }) {
  return <section className="filter-bar"><div><label htmlFor="org-search">Search employee, repo, error or reason</label><input id="org-search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Try: employee, repository, sqlite..." autoComplete="off"/></div><div><label htmlFor="date-range">Date range</label><select id="date-range" value={filters.range} onChange={(event) => setFilters({ ...filters, range: event.target.value })}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></div><div><label htmlFor="repo-filter">Repository</label><select id="repo-filter" value={filters.repository} onChange={(event) => setFilters({ ...filters, repository: event.target.value })}><option value="all">All repositories</option>{data.repositories.map((repo) => <option value={repo.name} key={repo.name}>{repo.name}</option>)}</select></div><div><label htmlFor="employee-filter">Employee</label><select id="employee-filter" value={filters.employee} onChange={(event) => setFilters({ ...filters, employee: event.target.value })}><option value="all">All employees</option>{data.employees.map((employee) => <option value={employee.login} key={employee.login}>{employee.name}</option>)}</select></div><button onClick={() => setFilters({ range: "7d", search: "", repository: "all", employee: "all" })}>Reset</button><small>{data.pagination ? `${data.pagination.totalEmployees.toLocaleString()} employees · ${data.pagination.totalRepositories.toLocaleString()} repos · ${data.pagination.totalIncidents.toLocaleString()} incidents${filters.search ? ` matching “${filters.search}”` : ""}` : "Organization scope"}</small></section>;
}

function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return <nav className="admin-pagination" aria-label="Results pagination"><span>Showing <b>{start}-{end}</b> of <b>{total.toLocaleString()}</b></span><label>Rows <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><strong>Page {page} / {pages}</strong><button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></nav>;
}

function Delta({ value, unit = "", goodWhen = "up", caption }: { value: number; unit?: string; goodWhen?: "up" | "down"; caption: string }) {
  const good = goodWhen === "up" ? value >= 0 : value <= 0;
  return <><b className={good ? "good-text" : "danger-text"}>{value > 0 ? "+" : ""}{value}{unit}</b><small>{caption}</small></>;
}

function DailyTrend({ data }: { data: OrganizationSnapshot }) {
  const labels = data.trend.map((point) => point.date);
  const today = data.trend.at(-1);
  return <section className="daily-panel"><header><div><span className="panel-kicker">Daily movement</span><h2>Is the team improving?</h2></div><div className="today-comparison"><Delta value={data.metrics.cleanRateDelta} unit="%" caption="clean accuracy vs previous period"/><Delta value={data.metrics.openDelta} goodWhen="down" caption="errors caught vs previous period"/></div></header>
    <div className="trend-charts">
      <figure><figcaption>Errors opened, fixed and gates blocked</figcaption>
        <LineChart labels={labels} emptyMessage="No completed checks in this date range." series={[
          { key: "opened", label: "Errors opened", color: "#ff6b6b", values: data.trend.map((point) => point.opened), fill: true },
          { key: "fixed", label: "Errors fixed", color: "#4ade80", values: data.trend.map((point) => point.fixed) },
          { key: "blocked", label: "Gates blocked", color: "#facc15", values: data.trend.map((point) => point.blocked), dashed: true },
        ]}/>
      </figure>
      <figure><figcaption>Clean-check accuracy</figcaption>
        <LineChart labels={labels} unit="%" maxOverride={100} emptyMessage="No completed checks in this date range." series={[
          { key: "accuracy", label: "Clean accuracy", color: "#5da8ff", values: data.trend.map((point) => point.accuracy), fill: true },
        ]}/>
      </figure>
    </div>
    <footer><span>A fix is counted when a branch that failed a check later passes one.</span>{today && <strong>Today: {today.fixed} fixed vs {today.opened} opened</strong>}</footer></section>;
}

function PersonalProgress({ employee }: { employee: OrganizationSnapshot["employees"][number] }) {
  const daily = employee.daily ?? [];
  // Movement across the period actually on screen, rather than a figure the
  // reader cannot tie back to the line in front of them.
  const delta = daily.length > 1 ? daily.at(-1)!.accuracy - daily[0].accuracy : 0;
  return <section className="personal-progress"><header><div><span className="panel-kicker">Personal progress</span><h3>{employee.name}&apos;s clean-check trend</h3></div><b className={delta >= 0 ? "good-text" : "danger-text"}>{delta > 0 ? "+" : ""}{delta}%</b></header>
    <LineChart height={180} labels={daily.map((point) => point.date)} unit="%" maxOverride={100} emptyMessage="No completed checks for this employee in the selected range." series={[
      { key: "accuracy", label: "Clean accuracy", color: "#5da8ff", values: daily.map((point) => point.accuracy), fill: true },
    ]}/>
    <footer>Measured from this employee&apos;s own completed checks, day by day.</footer></section>;
}

function Metrics({ data }: { data: OrganizationSnapshot }) {
  const items = [["Employees", data.metrics.employees], ["Repositories", data.metrics.repositories], ["Open incidents", data.metrics.open], ["Blocked PRs", data.metrics.blockedPrs], ["GitHub failures", data.metrics.githubFailures ?? 0], ["LeakGuard scans", data.metrics.scans]];
  return <section className="admin-metrics">{items.map(([label, value]) => <div className="admin-stat" key={label}><small>{label}</small><b>{value}</b></div>)}</section>;
}

function EmployeeTable({ data, compact = false }: { data: OrganizationSnapshot; compact?: boolean }) {
  const employees = useMemo(() => [...data.employees].sort((a, b) => b.score - a.score), [data]);
  return <section className="admin-card"><div className="admin-card-head"><div><span className="panel-kicker">Team security performance</span><h2>{compact ? "Employee risk leaderboard" : "All employees"}</h2></div><span className="admin-help">Accuracy = successful LeakGuard reports or completed CI runs / all completed checks</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Rank / employee</th><th>Repositories</th><th>Security score</th><th>Clean accuracy</th><th>D / L / P errors</th><th>Blocked PRs</th><th>Fix rate</th><th>Avg fix</th></tr></thead><tbody>{employees.map((employee, index) => <tr key={employee.login}><td><span className="rank">#{index + 1}</span><span className="avatar">{employee.avatar}</span><strong>{employee.name}<small>@{employee.login} · {employee.scans} checks</small></strong></td><td><b>{employee.repositories.length}</b><small>{employee.repositories.map((repo) => repo.repository).join(", ")}</small></td><td><b className={employee.scans && employee.score >= 60 ? "good-text" : "danger-text"}>{employee.scans ? employee.score : "—"}</b><span className="score-track"><i style={{ width: `${employee.score}%` }}/></span></td><td><b className={employee.scans && employee.cleanRate >= 60 ? "good-text" : "danger-text"}>{employee.scans ? `${employee.cleanRate}%` : "—"}</b></td><td><span className="severity-count definite">{employee.definite}</span><span className="severity-count likely">{employee.likely}</span><span className="severity-count possible">{employee.possible}</span></td><td>{employee.blocked}</td><td>{employee.fixRate}%<small>{employee.fixed} fixed</small></td><td>{employee.avgFixHours}h</td></tr>)}</tbody></table></div></section>;
}

function EmployeeDirectory({ data }: { data: OrganizationSnapshot }) {
  // Riskiest first, but anyone with no completed checks has no score to speak
  // of - left in the ordering they sink to the top and the panel opens on a
  // profile with nothing in it.
  const ordered = [...data.employees].sort((a, b) => Number(Boolean(b.scans)) - Number(Boolean(a.scans)) || a.score - b.score);
  const [selected, setSelected] = useState(() => ordered[0]?.login ?? "");
  if (ordered.length === 0) {
    return <section className="employee-profile empty-directory"><span className="panel-kicker">Employee directory</span><h2>No employees match these filters</h2><p>Reset the employee, repository or search filter to restore the organization view.</p></section>;
  }
  const employee = data.employees.find((item) => item.login === selected) ?? ordered[0];
  const incidents = data.incidents.filter((item) => item.employee === employee.login);
  return <section className="directory-layout"><aside className="employee-list"><header><span className="panel-kicker">Directory</span><strong>{data.employees.length} employees on this page</strong></header>{ordered.map((item) => <button className={item.login === employee.login ? "active" : ""} key={item.login} onClick={() => setSelected(item.login)}><span className="avatar">{item.avatar}</span><span><strong>{item.name}</strong><small>@{item.login} · {item.repositories.length} repos · {item.open} open</small></span><b className={!item.scans ? "" : item.score < 60 ? "danger-text" : "good-text"}>{item.scans ? item.score : "—"}</b></button>)}</aside><article className="employee-profile"><header><div><span className="panel-kicker">Combined across all repositories</span><h2>{employee.name} <small>@{employee.login}</small></h2></div><span className={`profile-score ${!employee.scans ? "idle" : employee.score < 60 ? "risk" : "healthy"}`}><b>{employee.scans ? employee.score : "—"}</b><small>{employee.scans ? "security score" : "no checks yet"}</small></span></header><div className="profile-kpis"><span><small>Repositories</small><b>{employee.repositories.length}</b></span><span><small>Clean-check accuracy</small><b>{employee.cleanRate}%</b></span><span><small>Open errors</small><b>{employee.open}</b></span><span><small>Fix rate</small><b>{employee.fixRate}%</b></span><span><small>Mean time to fix</small><b>{employee.avgFixHours}h</b></span><span><small>Repeat errors</small><b>{employee.repeats}</b></span></div><PersonalProgress employee={employee}/><div className="profile-columns"><div><h3>Repository-wise work accuracy</h3>{employee.repositories.map((repo) => <div className="repo-contribution" key={repo.repository}><strong>{repo.repository}<small>{repo.checks} PR checks · {repo.blocked} blocked · {repo.errors} errors</small></strong><span className="repo-accuracy"><b>{repo.cleanRate}%</b><i><em style={{ width: `${repo.cleanRate}%` }}/></i><small>clean accuracy</small></span></div>)}</div><div><h3>Recent attributed errors</h3>{incidents.length ? incidents.map((incident) => <div className="profile-incident" key={incident.id}><span className={`severity ${incident.confidence}`}>{incident.confidence}</span><strong>{incident.resource}<small>{incident.repository} · {incident.file}</small></strong><em>{incident.pr ? `PR #${incident.pr}` : incident.branch}</em></div>) : <p className="empty-state">No recent errors for this employee.</p>}</div></div></article></section>;
}

function RepositoryActivity({ logs }: { logs: NonNullable<OrganizationSnapshot["repositories"][number]["activity"]> }) {
  if (!logs.length) return <p className="empty-state">No GitHub workflow activity in this date range.</p>;
  return <div className="activity-log-list">{logs.map((log) => <article className="activity-log" key={log.id}><span className={`activity-status ${log.conclusion === "success" ? "success" : log.conclusion === "failure" ? "failure" : "pending"}`}>{log.conclusion}</span><strong>{log.workflow}<small>@{log.employee} · {log.branch}</small></strong><time>{new Date(log.createdAt).toLocaleString()}</time>{log.runUrl && <a href={log.runUrl} target="_blank" rel="noreferrer">Open run</a>}</article>)}</div>;
}

function RepoPortfolio({ data, detailed = false }: { data: OrganizationSnapshot; detailed?: boolean }) {
  const [selected, setSelected] = useState("");
  const activeRepository = data.repositories.find((repo) => repo.name === selected) ?? data.repositories[0];
  const visibleRepositories = detailed ? (activeRepository ? [activeRepository] : []) : data.repositories.slice(0, 6);
  return <section className={detailed ? "repository-stack" : "repo-risk-grid"}>
    {detailed && <><div className="repository-browser-head"><div><span className="panel-kicker">Repository portfolio</span><h2>Choose a repository</h2></div><small>Click a repository to inspect every contributor and workflow run</small></div><div className="repository-selector-grid">{data.repositories.map((repo) => <button className={`repo-select-card ${repo.risk} ${activeRepository?.name === repo.name ? "active" : ""}`} key={repo.name} onClick={() => setSelected(repo.name)}><span className="repo-symbol">R</span><span><strong>{repo.name}</strong><small>{repo.language} · {repo.members.length} employees</small></span><span><b>{repo.open}</b><small>open</small></span><em>{repo.risk}</em></button>)}</div></>}
    {visibleRepositories.map((repo) => {
      const incidents = data.incidents.filter((item) => item.repository === repo.name).slice(0, 8);
      if (!detailed) return <article className={`repo-risk ${repo.risk}`} key={repo.name}><div><span className="repo-symbol">R</span><span><strong>{repo.name}</strong><small>{repo.language} · {repo.members.length} employees</small></span></div><b>{repo.open}<small>open incidents</small></b><footer><span>{repo.blockedPrs} PRs blocked</span><em>{repo.risk} risk</em></footer></article>;
      return <article className={`repository-panel ${repo.risk}`} key={repo.name}><header><div><span className="repo-symbol">R</span><span><h2>{repo.name}</h2><small>{repo.language} · {repo.scans} completed checks · {repo.members.length} contributors · {repo.teams.length} teams</small></span></div><div className="repo-summary"><span><b>{repo.open}</b><small>open errors</small></span><span><b>{repo.blockedPrs}</b><small>failed checks</small></span><em>{repo.risk} risk</em></div></header><div className="team-strip">{repo.teams.map((team) => <div className="team-card" key={team.name}><header><strong>{team.name}</strong><span className={team.cleanRate < 60 ? "danger-text" : "good-text"}>{repo.scans ? `${team.cleanRate}% clean` : "No checks yet"}</span></header><small>Lead @{team.lead} · {team.members.length} members</small><div><span><b>{team.open}</b> open</span><span><b>{team.blocked}</b> blocked</span></div></div>)}</div><div className="repository-body"><div><h3>Employees in this repository</h3><table className="repo-member-table"><thead><tr><th>Employee</th><th>Checks</th><th>Accuracy</th><th>Errors</th><th>Blocked</th></tr></thead><tbody>{repo.members.map((member) => { const person = data.employees.find((item) => item.login === member.login); return <tr key={member.login}><td><span className="avatar">{person?.avatar ?? member.login[0]?.toUpperCase()}</span><strong>{person?.name ?? member.login}<small>@{member.login}</small></strong></td><td>{member.checks}</td><td><b className={member.checks && member.cleanRate >= 60 ? "good-text" : "danger-text"}>{member.checks ? `${member.cleanRate}%` : "—"}</b></td><td>{member.errors}</td><td>{member.blocked}</td></tr>; })}</tbody></table></div><div><h3>Repository incidents</h3>{incidents.length ? incidents.map((incident) => <div className="repo-incident" key={incident.id}><header><span className={`severity ${incident.confidence}`}>{incident.confidence}</span><b>{incident.id}</b><em>{incident.status}</em></header><strong>{incident.resource}</strong><small>@{incident.employee} · {incident.pr ? `PR #${incident.pr}` : incident.branch}</small><code>{incident.file}</code><span className={`gate ${incident.gate}`}>{incident.gate === "blocked" ? "Merge blocked" : "Resolved"}</span></div>) : <p className="empty-state">No repository incidents.</p>}<h3 className="activity-heading">GitHub activity · {repo.activity?.length ?? 0} runs</h3><RepositoryActivity logs={repo.activity ?? []}/></div></div></article>;
    })}
  </section>;
}

function IncidentTable({ data, limit }: { data: OrganizationSnapshot; limit?: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const incidents = limit ? data.incidents.slice(0, limit) : data.incidents;
  return <section className="admin-card"><div className="admin-card-head"><div><span className="panel-kicker">GitHub enforcement</span><h2>Employee errors with reasons</h2></div><span className="admin-help">Click for reasoning and technical evidence</span></div><div className="admin-table-wrap"><table className="admin-table incident-table"><thead><tr><th>Incident</th><th>Employee / repository</th><th>Finding</th><th>Pull request</th><th>Gate</th></tr></thead><tbody>{incidents.map((incident) => <Fragment key={incident.id}><tr className="clickable-incident" onClick={() => setSelected(selected === incident.id ? null : incident.id)}><td><strong>{incident.id}</strong><small>{incident.detectedAt}</small></td><td><strong>@{incident.employee}</strong><small>{incident.repository} · {incident.branch}</small></td><td><span className={`severity ${incident.confidence}`}>{incident.confidence}</span><strong>{incident.resource}</strong><small>{incident.file}</small></td><td>{incident.pr ? `#${incident.pr}` : <small className="muted-cell">no PR recorded</small>}</td><td><span className={`gate ${incident.gate}`}>{incident.gate === "blocked" ? "Blocked" : "Allowed"}</span></td></tr>{selected === incident.id && <tr className="incident-evidence"><td colSpan={5}><div><span><small>Why LeakGuard flagged it</small><strong>{incident.reason}</strong><em>Coaching context for @{incident.employee}</em></span><span><small>Technical witness path</small><ol>{incident.leakPath.map((step) => <li key={step}>{step}</li>)}</ol></span></div></td></tr>}</Fragment>)}</tbody></table></div></section>;
}

export function AdminDashboard({ view }: { view: View }) {
  const [filters, setFilters] = useState({ range: "7d", search: "", repository: "all", employee: "all" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => setPage(1), [filters.range, filters.search, filters.repository, filters.employee]);
  const { data, loading, refresh } = useOrganization(filters, page, pageSize);
  const total = view === "repositories" ? data.pagination?.totalRepositories ?? data.repositories.length : view === "incidents" ? data.pagination?.totalIncidents ?? data.incidents.length : data.pagination?.totalEmployees ?? data.employees.length;
  const titles = { overview: ["Organization command center", "Security posture across every employee, repository and protected pull request."], employees: ["Employee security", "Compare exact leak types, clean-check accuracy and remediation performance."], repositories: ["Repository risk", "Prioritize repositories carrying the highest unresolved resource-leak debt."], incidents: ["Leak incidents", "Audit every finding attributed to its employee, branch, commit and pull request."] };
  return <>{loading && <div className="admin-loading"><i/> Syncing organization data</div>}<div className="admin-top"><div><span className="eyebrow">LeakGuard Organization</span><h1 className="page-title">{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="org-live-controls"><div className="org-chip"><span>CB</span><strong>{data.organization}<small>Live SQLite control plane · refreshes every {REFRESH_MS / 1000}s</small></strong></div><button onClick={refresh} disabled={loading}>{loading ? "Syncing…" : "Refresh GitHub"}</button></div></div>{data.syncError && <div className="sync-warning"><b>GitHub sync needs attention:</b> {data.syncError}. Stored Action reports are still available.</div>}<FilterBar data={data} filters={filters} setFilters={setFilters}/>{view === "overview" && <><Metrics data={data}/><DailyTrend data={data}/><div className="admin-section-title"><h2>Repository portfolio</h2><span>Last DB update {new Date(data.generatedAt).toLocaleTimeString()}</span></div><RepoPortfolio data={data}/><EmployeeTable data={data} compact/><IncidentTable data={data} limit={3}/></>}{view === "employees" && <><DailyTrend data={data}/><EmployeeDirectory data={data}/><EmployeeTable data={data}/></>}{view === "repositories" && <RepoPortfolio data={data} detailed/>}{view === "incidents" && <><Metrics data={data}/><IncidentTable data={data}/></>}<Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }}/></>;
}
