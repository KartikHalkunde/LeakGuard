import { NextResponse } from "next/server";
import { ingestScan, verifySignature } from "@/lib/controlPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-leakguard-signature"))) {
    return NextResponse.json({ error: "Invalid LeakGuard signature" }, { status: 401 });
  }
  try {
    return NextResponse.json(ingestScan(JSON.parse(body)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid report" }, { status: 400 });
  }
}
