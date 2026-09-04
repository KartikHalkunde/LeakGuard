import { sampleFp, sampleReport, sampleTrend } from "./sample";
import type { FpPoint, Report, TrendPoint } from "./types";

async function request<T>(path: string, fallback: T): Promise<T> {
  const base = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL?.replace(/\/$/, "");
  if (!base) return fallback;
  try {
    const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export const loadFindings = () => request<Report>("/findings", sampleReport);
export const loadTrend = () => request<TrendPoint[]>("/trend", sampleTrend);
export const loadFpRate = () => request<FpPoint[]>("/fp-rate", sampleFp);

export function fixCommand(file: string): string {
  const quoted = file.includes(" ") ? `"${file.replaceAll('"', '\\"')}"` : file;
  return `leakguard fix ${quoted} --write`;
}
