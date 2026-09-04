export type Confidence = "definite" | "likely" | "possible";

export interface PathStep { line: number; note: string }
export interface Finding {
  fingerprint: string;
  confidence: Confidence;
  resource: string;
  file: string;
  function: string;
  variable: string;
  acquired_at: { line: number; col: number; snippet: string };
  leak_path: PathStep[];
  reason: string;
  fix_available: boolean;
}
export interface Report { version: string; findings: Finding[] }

export function parseReport(output: string): Report {
  const value: unknown = JSON.parse(output);
  if (!value || typeof value !== "object") throw new Error("LeakGuard returned an invalid report");
  const report = value as Partial<Report>;
  if (!Array.isArray(report.findings)) throw new Error("LeakGuard report has no findings array");
  return { version: String(report.version ?? "unknown"), findings: report.findings as Finding[] };
}

export function lineIndex(line: number, lineCount: number): number {
  return Math.min(Math.max(Number.isFinite(line) ? line - 1 : 0, 0), Math.max(lineCount - 1, 0));
}
