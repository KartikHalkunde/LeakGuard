import { NextResponse } from "next/server";
import { syncGitHub } from "@/lib/githubSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.LEAKGUARD_ADMIN_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try { return NextResponse.json(await syncGitHub(true)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "GitHub sync failed" }, { status: 502 }); }
}
