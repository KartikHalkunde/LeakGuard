import { describe, expect, it } from "vitest";
import { fixCommand, loadFindings } from "./api";

describe("fixCommand", () => {
  it("creates a verified CLI fix command", () => expect(fixCommand("app/main.py")).toBe("leakguard fix app/main.py --write"));
  it("quotes paths containing spaces", () => expect(fixCommand("my app/main.py")).toBe('leakguard fix "my app/main.py" --write'));
  it("uses fixtures when no control-plane URL is configured", async () => {
    const report = await loadFindings();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.some((finding) => finding.confidence === "definite")).toBe(true);
  });
});
