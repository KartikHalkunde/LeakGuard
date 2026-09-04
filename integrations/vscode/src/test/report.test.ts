import assert from "node:assert/strict";
import test from "node:test";
import { lineIndex, parseReport } from "../report";

test("parses the canonical LeakGuard report", () => {
  const report = parseReport(JSON.stringify({ version: "1.0", findings: [{ fingerprint: "abc" }] }));
  assert.equal(report.version, "1.0");
  assert.equal(report.findings[0].fingerprint, "abc");
});

test("rejects malformed reports", () => {
  assert.throws(() => parseReport("{}"), /findings/);
});

test("converts one-based lines and clamps invalid positions", () => {
  assert.equal(lineIndex(3, 10), 2);
  assert.equal(lineIndex(0, 10), 0);
  assert.equal(lineIndex(50, 10), 9);
});
