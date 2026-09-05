import { NextResponse } from "next/server";
import { db } from "@/lib/controlPlaneDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    db().prepare("SELECT 1").get();
    return NextResponse.json({
      status: "ok",
      database: "ready",
      persistence: process.env.LEAKGUARD_DB_EPHEMERAL === "true" ? "ephemeral" : "persistent",
      githubSyncConfigured: Boolean(process.env.LEAKGUARD_GITHUB_ORG),
      githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
      signedIngestConfigured: Boolean(process.env.LEAKGUARD_SECRET),
    });
  } catch (error) {
    return NextResponse.json({ status: "error", database: "unavailable", detail: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
