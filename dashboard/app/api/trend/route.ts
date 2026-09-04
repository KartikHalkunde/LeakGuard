import { NextResponse } from "next/server";
import { sampleTrend } from "@/lib/sample";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(sampleTrend); }
