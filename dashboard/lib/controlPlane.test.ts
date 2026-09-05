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
});
