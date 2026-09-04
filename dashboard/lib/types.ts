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
  close_found_at: number[];
  exit_kind: string;
  reason: string;
  fix_available: boolean;
  severity: string;
}
export interface Report {
  version: string;
  summary: Record<string, number>;
  findings: Finding[];
}
export interface TrendPoint { date: string; open: number; definite: number }
export interface FpPoint { date: string; rate: number }
