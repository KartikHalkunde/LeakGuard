import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { basename, resolve } from "node:path";
import { NextResponse } from "next/server";
import type { Report } from "@/lib/types";
import { recordScan } from "@/lib/scanHistory";

export const dynamic = "force-dynamic";
const run = promisify(execFile);

export async function POST() {
  const repoRoot = resolve(process.cwd(), "..");
  const scope = process.env.LEAKGUARD_SCAN_SCOPE ?? "demo-repo/app";
  const reportPath = resolve(repoRoot, process.env.LEAKGUARD_REPORT_PATH ?? "leakguard.json");
  const executable = process.env.LEAKGUARD_EXECUTABLE ?? (
    process.platform === "win32" ? resolve(repoRoot, ".venv/Scripts/leakguard.exe") : "leakguard"
  );
  try {
    await run(executable, ["check", scope, "--format", "json", "--fail-on", "never", "--no-baseline", "-o", reportPath], {
      cwd: repoRoot,
      timeout: 15_000,
      windowsHide: true,
    });
    const [raw, info] = await Promise.all([readFile(reportPath, "utf8"), stat(reportPath)]);
    const report = JSON.parse(raw) as Report;
    report.meta = {
      repository: process.env.LEAKGUARD_REPOSITORY ?? basename(repoRoot),
      scope,
      source: "live-report",
      generated_at: info.mtime.toISOString(),
    };
    await recordScan(report);
    return NextResponse.json(report);
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Scan failed" }, { status: 500 });
  }
}
