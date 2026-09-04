import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Report, TrendPoint } from "./types";

type HistoryEntry = TrendPoint & { scanned_at: string; files: number };

const repoRoot = resolve(process.cwd(), "..");
const historyPath = resolve(repoRoot, ".leakguard-cache", "dashboard-history.json");

export async function readScanHistory(): Promise<HistoryEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(historyPath, "utf8"));
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

export async function recordScan(report: Report): Promise<HistoryEntry[]> {
  const history = await readScanHistory();
  const now = new Date();
  history.push({
    date: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    scanned_at: now.toISOString(),
    open: report.summary.total ?? report.findings.length,
    definite: report.summary.definite ?? report.findings.filter((finding) => finding.confidence === "definite").length,
    files: report.summary.files_scanned ?? 0,
  });
  const retained = history.slice(-30);
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(historyPath, JSON.stringify(retained, null, 2), "utf8");
  return retained;
}
