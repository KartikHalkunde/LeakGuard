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
    expect(scores[0].score).toBeGreaterThan(scores.at(-1)!.score);
    expect(scores.at(-1)?.open).toBeGreaterThan(scores[0].open);
  });

  it("provides a large paginatable organization demo", () => {
    expect(organizationSnapshot.employees.length).toBe(1200);
    expect(organizationSnapshot.repositories.length).toBe(120);
    expect(organizationSnapshot.incidents.length).toBe(2400);
  });

  it("maps every blocked incident to a pull request and employee", () => {
    const blocked = organizationSnapshot.incidents.filter((incident) => incident.gate === "blocked");
    expect(blocked.length).toBe(organizationSnapshot.metrics.blockedPrs);
    expect(blocked.every((incident) => incident.pr > 0 && incident.employee && incident.branch)).toBe(true);
  });

  it("keeps repository membership linked to known employees", () => {
    const employees = new Set(organizationSnapshot.employees.map((employee) => employee.login));
    const repositories = new Set(organizationSnapshot.repositories.map((repository) => repository.name));
    expect(organizationSnapshot.repositories.every((repository) => repository.members.every((member) => employees.has(member.login)))).toBe(true);
    expect(organizationSnapshot.employees.every((employee) => employee.repositories.every((repository) => repositories.has(repository.repository)))).toBe(true);
  });

  it("keeps coaching evidence on every attributed incident", () => {
    expect(organizationSnapshot.incidents.every((incident) =>
      incident.reason.length > 10 && incident.leakPath.length >= 2
    )).toBe(true);
  });

  it("shows daily improvement with comparable opened and fixed counts", () => {
    expect(organizationSnapshot.trend.length).toBeGreaterThan(1);
    const today = organizationSnapshot.trend.at(-1)!;
    expect(today.fixed).toBeGreaterThanOrEqual(today.opened);
    expect(today.accuracy).toBeGreaterThan(0);
  });

  it("groups repository contributors into accountable teams", () => {
    const employees = new Set(organizationSnapshot.employees.map((employee) => employee.login));
    expect(organizationSnapshot.repositories.every((repository) => repository.teams.length > 0)).toBe(true);
    expect(organizationSnapshot.repositories.every((repository) => repository.teams.every((team) =>
      employees.has(team.lead) && team.members.every((login) => employees.has(login))
    ))).toBe(true);
  });
});
