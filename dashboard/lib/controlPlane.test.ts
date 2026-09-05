import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { buildOrganizationSnapshot, ingestScan, upsertPerson, upsertRepository, upsertWorkflowRun, verifySignature } from "./controlPlane";
import { resetDbForTests } from "./controlPlaneDb";

const testDb = resolve(process.cwd(), ".leakguard-data", "control-plane-test.sqlite");

beforeEach(() => {
  resetDbForTests();
  process.env.LEAKGUARD_DB_PATH = testDb;
  if (existsSync(testDb)) rmSync(testDb);
});

afterEach(() => {
  resetDbForTests();
  if (existsSync(testDb)) rmSync(testDb);
  delete process.env.LEAKGUARD_DB_PATH;
});

describe("organization control plane", () => {
  it("verifies exact HMAC bytes", () => {
    const body = '{"findings":[]}';
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifySignature(body, `sha256=${signature}`, "secret")).toBe(true);
    expect(verifySignature(`${body}\n`, `sha256=${signature}`, "secret")).toBe(false);
  });

  it("attributes a failed scan and resolves it after a clean scan", () => {
    const finding = { fingerprint: "abc", confidence: "likely", resource: "builtins.file", file: "app.py", acquired_at: { line: 3 }, leak_path: [{ line: 3, note: "opened" }], reason: "early return leaves file open" };
    ingestScan({ summary: { likely: 1, total: 1 }, findings: [finding], context: { repo: "acme/api", actor: "nikita", branch: "feature", commit: "one", run_url: "https://github/run/1", gate_status: "blocked" } });
    ingestScan({ summary: { likely: 0, total: 0 }, findings: [], context: { repo: "acme/api", actor: "nikita", branch: "feature", commit: "two", run_url: "https://github/run/2", gate_status: "passed" } });
    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    expect(snapshot.metrics.scans).toBe(2);
    expect(snapshot.metrics.open).toBe(0);
    expect(snapshot.incidents[0].status).toBe("fixed");
    expect(snapshot.employees[0].login).toBe("nikita");
    expect(snapshot.repositories[0].name).toBe("acme/api");
  });

  it("keeps every synced member and workflow log even without a LeakGuard scan", () => {
    const repository = "acme/api";
    upsertRepository({ full_name: repository, name: "api", language: "Python" });
    upsertPerson({ login: "ana", name: "Ana" }, repository);
    upsertPerson({ login: "ben", name: "Ben" }, repository);
    upsertWorkflowRun({ id: 91, actor: { login: "ben" }, head_branch: "feat/logs", name: "LeakGuard", status: "completed", conclusion: "success", html_url: "https://github.example/runs/91", created_at: new Date().toISOString() }, repository);

    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    expect(snapshot.repositories[0].members.map((member) => member.login)).toEqual(["ana", "ben"]);
    expect(snapshot.repositories[0].activity).toEqual([expect.objectContaining({ id: 91, employee: "ben", branch: "feat/logs", conclusion: "success" })]);
  });

  it("uses completed workflow outcomes until the signed LeakGuard report arrives", () => {
    const repository = "acme/api";
    upsertRepository({ full_name: repository, name: "api", language: "Python" });
    const createdAt = new Date().toISOString();
    upsertWorkflowRun({ id: 101, actor: { login: "leaky-dev", name: "Leaky Dev" }, head_branch: "feat/leak", name: "CI", status: "completed", conclusion: "failure", created_at: createdAt }, repository);
    upsertWorkflowRun({ id: 102, actor: { login: "clean-dev", name: "Clean Dev" }, head_branch: "feat/clean", name: "CI", status: "completed", conclusion: "success", created_at: createdAt }, repository);

    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    const leaky = snapshot.employees.find((employee) => employee.login === "leaky-dev");
    const clean = snapshot.employees.find((employee) => employee.login === "clean-dev");
    expect(leaky).toMatchObject({ scans: 1, cleanRate: 0, blocked: 1 });
    expect(clean).toMatchObject({ scans: 1, cleanRate: 100, blocked: 0 });
  });

  it("charts a day per day in the range and credits a red-to-green fix", () => {
    const repository = "acme/api";
    upsertRepository({ full_name: repository, name: "api", language: "Python" });
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    upsertWorkflowRun({ id: 201, actor: { login: "dev-a" }, head_branch: "feat/leak", name: "LeakGuard", status: "completed", conclusion: "failure", created_at: hoursAgo(5) }, repository);
    upsertWorkflowRun({ id: 202, actor: { login: "dev-a" }, head_branch: "feat/leak", name: "LeakGuard", status: "completed", conclusion: "success", created_at: hoursAgo(2) }, repository);

    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    // One point per day, present whether or not anything happened that day.
    expect(snapshot.trend).toHaveLength(7);
    expect(snapshot.trend.at(-1)?.date).toBe("Today");
    const sum = (key: "opened" | "fixed" | "blocked") => snapshot.trend.reduce((total, point) => total + point[key], 0);
    expect(sum("opened")).toBe(1);
    expect(sum("blocked")).toBe(1);
    // The success after the failure is the fix; nothing else records remediation.
    expect(sum("fixed")).toBe(1);
    expect(snapshot.employees[0]).toMatchObject({ login: "dev-a", avgFixHours: 3 });
    expect(snapshot.employees[0].daily).toHaveLength(7);
  });

  it("records a failed check as an incident when no signed report arrived", () => {
    const repository = "acme/api";
    upsertRepository({ full_name: repository, name: "api", language: "Python" });
    upsertWorkflowRun({ id: 301, actor: { login: "dev-b" }, head_branch: "feat/open", name: "LeakGuard", status: "completed", conclusion: "failure", html_url: "https://github.example/runs/301", created_at: new Date().toISOString() }, repository);

    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    expect(snapshot.incidents).toHaveLength(1);
    expect(snapshot.incidents[0]).toMatchObject({ id: "RUN-301", employee: "dev-b", status: "open", gate: "blocked", runUrl: "https://github.example/runs/301" });
    // No finding-level detail is invented; the reason says where it lives.
    expect(snapshot.incidents[0].reason).toContain("run log");
    expect(snapshot.metrics.open).toBe(1);
  });

  it("keeps bot identities out of the employee leaderboard", () => {
    const repository = "acme/api";
    upsertRepository({ full_name: repository, name: "api", language: "Python" });
    const createdAt = new Date().toISOString();
    upsertWorkflowRun({ id: 401, actor: { login: "dependabot[bot]" }, head_branch: "deps", name: "CI", status: "completed", conclusion: "success", created_at: createdAt }, repository);
    upsertWorkflowRun({ id: 402, actor: { login: "dev-c" }, head_branch: "feat/x", name: "CI", status: "completed", conclusion: "success", created_at: createdAt }, repository);

    const snapshot = buildOrganizationSnapshot({ range: "7d", search: "", repository: "all", employee: "all", page: 1, pageSize: 25 });
    expect(snapshot.employees.map((employee) => employee.login)).toEqual(["dev-c"]);
    expect(snapshot.repositories[0].members.map((member) => member.login)).toEqual(["dev-c"]);
    // The bot's run is still real CI activity, so it stays in the totals.
    expect(snapshot.metrics.scans).toBe(2);
  });
});
