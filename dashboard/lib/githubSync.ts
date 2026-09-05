import { db } from "./controlPlaneDb";
import { upsertPerson, upsertRepository, upsertWorkflowRun } from "./controlPlane";

type JsonObject = Record<string, unknown>;
const API = "https://api.github.com";

/** A GitHub failure that still carries what we need to back off intelligently. */
export class GitHubError extends Error {
  constructor(readonly status: number, readonly rateLimited: boolean, readonly resetAt: number | undefined, message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

async function githubValue(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "LeakGuard-Control-Plane" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    // GitHub reports an exhausted quota as 403 (or 429) with the remaining
    // count at zero, and tells us in a header exactly when it refills.
    const remaining = response.headers.get("x-ratelimit-remaining");
    const rateLimited = response.status === 429
      || (response.status === 403 && (remaining === "0" || /rate limit/i.test(body)));
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    throw new GitHubError(
      response.status, rateLimited,
      Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined,
      rateLimited
        ? `GitHub API rate limit reached. Sync paused until the quota refills.`
        : `GitHub API ${response.status}: ${body.slice(0, 300)}`,
    );
  }
  return response.json() as Promise<unknown>;
}

async function githubRows(path: string): Promise<JsonObject[]> {
  const value = await githubValue(path);
  if (Array.isArray(value)) return value as JsonObject[];
  const runs = (value as JsonObject).workflow_runs;
  return Array.isArray(runs) ? runs as JsonObject[] : [];
}

async function paginated(path: string, cap: number): Promise<JsonObject[]> {
  const result: JsonObject[] = [];
  for (let page = 1; result.length < cap; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const pageRows = await githubRows(`${path}${separator}per_page=100&page=${page}`);
    result.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  return result.slice(0, cap);
}

type SyncResult = { repositories: number; members: number; runs: number; skipped: boolean };
let pendingSync: Promise<SyncResult> | undefined;

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

async function branchHeadAuthors(owner: string, repo: string, cap: number): Promise<JsonObject[]> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const branches = await paginated(`${base}/branches`, cap).catch(() => []);
  const authors = await Promise.all(branches.map(async (branch) => {
    const sha = (branch.commit as JsonObject | undefined)?.sha;
    if (typeof sha !== "string" || !sha) return [];
    const commit = await githubValue(`${base}/commits/${encodeURIComponent(sha)}`).catch(() => undefined) as JsonObject | undefined;
    if (!commit) return [];
    return [commit.author, commit.committer].filter((person): person is JsonObject => Boolean(person && typeof person === "object"));
  }));
  return authors.flat();
}

async function performSync(force = false): Promise<SyncResult> {
  const organization = process.env.LEAKGUARD_GITHUB_ORG ?? "KartikHalkunde";
  const connection = db();
  const stamp = (value: string) => connection.prepare(
    "INSERT INTO sync_state(key,value) VALUES('github_last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
  const state = connection.prepare("SELECT value FROM sync_state WHERE key='github_last_sync'").get() as { value?: string } | undefined;
  const ttl = Math.max(10, Number(process.env.LEAKGUARD_GITHUB_SYNC_SECONDS ?? 60)) * 1000;
  const nextAllowed = connection.prepare("SELECT value FROM sync_state WHERE key='github_retry_after'").get() as { value?: string } | undefined;
  // A quota we have already exhausted will stay exhausted until GitHub refills
  // it. Retrying before then spends nothing but still fails, so honour the
  // reset time even when the caller asked to force a refresh.
  if (nextAllowed?.value && Date.now() < Date.parse(nextAllowed.value)) {
    throw new GitHubError(403, true, Date.parse(nextAllowed.value),
      `GitHub API rate limit reached. Sync resumes at ${new Date(nextAllowed.value).toLocaleTimeString()}.`);
  }
  if (!force && state?.value && Date.now() - Date.parse(state.value) < ttl) return { repositories: 0, members: 0, runs: 0, skipped: true };
  // Record the attempt before doing any work. Stamping only on success meant a
  // sync that threw part-way never wrote a timestamp, so the very next request
  // ran the whole expensive sync again - which is how one rate-limit failure
  // turned into a loop that could never recover.
  stamp(new Date().toISOString());
  // Budget, not ambition. Every 100 items is one request, and branch authors
  // cost an extra request *per branch* - the old 1000-branch default could
  // spend a thousand calls on a single repository. Authenticated GitHub allows
  // 5,000 per hour for everything, so keep one full sync in the low hundreds.
  const cap = limit("LEAKGUARD_GITHUB_REPO_LIMIT", 200);
  const memberCap = limit("LEAKGUARD_GITHUB_MEMBER_LIMIT", 100);
  const branchCap = limit("LEAKGUARD_GITHUB_BRANCH_LIMIT", 8);
  const workflowCap = limit("LEAKGUARD_GITHUB_WORKFLOW_LIMIT", 200);
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
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const [collaborators, contributors, branchAuthors, workflowRuns] = await Promise.all([
        paginated(`${base}/collaborators`, memberCap).catch(() => []),
        paginated(`${base}/contributors`, memberCap).catch(() => []),
        branchHeadAuthors(owner, repo, branchCap),
        paginated(`${base}/actions/runs`, workflowCap).catch(() => []),
      ]);
      // Collaborators requires elevated permissions on many public repos and
      // contributors excludes unmerged feature branches. Combining all three
      // sources keeps every visible teammate in the repository directory.
      const people = new Map<string, JsonObject>();
      [...collaborators, ...contributors, ...branchAuthors].forEach((person) => {
        const login = typeof person.login === "string" ? person.login : "";
        if (login) people.set(login, person);
      });
      people.forEach((person) => upsertPerson(person, fullName));
      workflowRuns.forEach((run) => upsertWorkflowRun(run, fullName));
      members += people.size;
      runs += workflowRuns.length;
    }));
  }
  stamp(new Date().toISOString());
  connection.prepare("DELETE FROM sync_state WHERE key='github_retry_after'").run();
  return { repositories: repositories.length, members, runs, skipped: false };
}

export function syncGitHub(force = false): Promise<SyncResult> {
  if (pendingSync) return pendingSync;
  pendingSync = performSync(force)
    .catch((error: unknown) => {
      if (error instanceof GitHubError && error.rateLimited) {
        // Park further syncs until GitHub says the quota is back. Stored
        // Action reports keep serving the dashboard in the meantime.
        const until = new Date(error.resetAt ?? Date.now() + 15 * 60_000).toISOString();
        db().prepare("INSERT INTO sync_state(key,value) VALUES('github_retry_after',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(until);
      }
      throw error;
    })
    .finally(() => { pendingSync = undefined; });
  return pendingSync;
}
