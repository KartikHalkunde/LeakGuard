import { describe, expect, it } from "vitest";
import { organizationSnapshot } from "./organization";

describe("organization snapshot", () => {
  it("keeps aggregate counts consistent with admin entities", () => {
    expect(organizationSnapshot.metrics.employees).toBe(organizationSnapshot.employees.length);
    expect(organizationSnapshot.metrics.repositories).toBe(organizationSnapshot.repositories.length);
    expect(organizationSnapshot.employees.reduce((sum, item) => sum + item.scans, 0)).toBe(organizationSnapshot.metrics.scans);
  });

  it("ranks secure employees above high-risk employees", () => {
    const scores = [...organizationSnapshot.employees].sort((a, b) => b.score - a.score);
    expect(scores[0].login).toBe("kartik-h");
    expect(scores.at(-1)?.open).toBeGreaterThan(scores[0].open);
  });

  it("maps every blocked incident to a pull request and employee", () => {
    const blocked = organizationSnapshot.incidents.filter((incident) => incident.gate === "blocked");
    expect(blocked.length).toBe(organizationSnapshot.metrics.blockedPrs);
    expect(blocked.every((incident) => incident.pr > 0 && incident.employee && incident.branch)).toBe(true);
  });
});
