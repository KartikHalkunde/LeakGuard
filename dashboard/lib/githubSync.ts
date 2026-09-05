import { db } from "./controlPlaneDb";
import { upsertPerson, upsertRepository, upsertWorkflowRun } from "./controlPlane";

type JsonObject = Record<string, unknown>;
const API = "https://api.github.com";

async function github(path: string): Promise<JsonObject[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "LeakGuard-Control-Plane" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  const value = await response.json() as unknown;
  return Array.isArray(value) ? value as JsonObject[] : (((value as JsonObject).workflow_runs as JsonObject[] | undefined) ?? []);
}

async function paginated(path: string, cap: number): Promise<JsonObject[]> {
  const result: JsonObject[] = [];
  for (let page = 1; result.length < cap; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const pageRows = await github(`${path}${separator}per_page=100&page=${page}`);
    result.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  return result.slice(0, cap);
}

type SyncResult = { repositories: number; members: number; runs: number; skipped: boolean };
let pendingSync: Promise<SyncResult> | undefined;

async function performSync(force = false): Promise<SyncResult> {
  const organization = process.env.LEAKGUARD_GITHUB_ORG ?? "KartikHalkunde";
  const connection = db();
  const state = connection.prepare("SELECT value FROM sync_state WHERE key='github_last_sync'").get() as { value?: string } | undefined;
  const ttl = Math.max(10, Number(process.env.LEAKGUARD_GITHUB_SYNC_SECONDS ?? 60)) * 1000;
  if (!force && state?.value && Date.now() - Date.parse(state.value) < ttl) return { repositories: 0, members: 0, runs: 0, skipped: true };
  const cap = Math.max(1, Number(process.env.LEAKGUARD_GITHUB_REPO_LIMIT ?? 1000));
  const account = encodeURIComponent(organization);
  const repositories = await paginated(`/orgs/${account}/repos?type=all&sort=updated`, cap)
    .catch(() => paginated(`/users/${account}/repos?type=owner&sort=updated`, cap));
  repositories.forEach(upsertRepository);
  let members = 0;
  let runs = 0;
  const concurrency = 5;
  for (let start = 0; start < repositories.length; start += concurrency) {
    await Promise.all(repositories.slice(start, start + concurrency).map(async (repository) => {
      const fullName = typeof repository.full_name === "string" ? repository.full_name : "";
      if (!fullName) return;
      const [owner, repo] = fullName.split("/");
      const [collaborators, workflowRuns] = await Promise.all([
        github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?per_page=100`)
          .catch(() => github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100`).catch(() => [])),
        github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=20`).catch(() => []),
      ]);
      collaborators.forEach((person) => upsertPerson(person, fullName));
      workflowRuns.forEach((run) => upsertWorkflowRun(run, fullName));
      members += collaborators.length;
      runs += workflowRuns.length;
    }));
  }
  const now = new Date().toISOString();
  connection.prepare("INSERT INTO sync_state(key,value) VALUES('github_last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(now);
  return { repositories: repositories.length, members, runs, skipped: false };
}

export function syncGitHub(force = false): Promise<SyncResult> {
  if (pendingSync) return pendingSync;
  pendingSync = performSync(force).finally(() => { pendingSync = undefined; });
  return pendingSync;
}
