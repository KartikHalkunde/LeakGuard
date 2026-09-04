import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { NextResponse } from "next/server";
import { sampleReport } from "@/lib/sample";
import type { Report } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const reportPath = resolve(process.env.LEAKGUARD_REPORT_PATH ?? "../leakguard.json");
  try {
    const [raw, info] = await Promise.all([readFile(reportPath, "utf8"), stat(reportPath)]);
    const report = JSON.parse(raw) as Report;
    report.meta = {
      repository: process.env.LEAKGUARD_REPOSITORY ?? basename(resolve("..")),
      scope: process.env.LEAKGUARD_SCAN_SCOPE ?? "tests/corpus/leaky",
      source: "live-report",
      generated_at: info.mtime.toISOString(),
    };
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(sampleReport, { headers: { "X-LeakGuard-Fallback": "true" } });
  }
}
