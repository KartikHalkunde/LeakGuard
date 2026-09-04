import { NextResponse } from "next/server";
import { sampleFp } from "@/lib/sample";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(sampleFp); }
