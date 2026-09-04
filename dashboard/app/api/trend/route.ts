import { NextResponse } from "next/server";
import { sampleTrend } from "@/lib/sample";
import { readScanHistory } from "@/lib/scanHistory";
export const dynamic = "force-dynamic";
export async function GET() {
  const history = await readScanHistory();
  return NextResponse.json(history.length ? history : sampleTrend);
}
