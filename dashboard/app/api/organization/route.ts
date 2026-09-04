import { NextResponse } from "next/server";
import { organizationSnapshot } from "@/lib/organization";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.LEAKGUARD_CONTROL_PLANE_URL?.replace(/\/$/, "");
  if (base) {
    try {
      const response = await fetch(`${base}/organization/overview`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${process.env.LEAKGUARD_DASHBOARD_TOKEN ?? ""}` },
        signal: AbortSignal.timeout(800), cache: "no-store",
      });
      if (response.ok) return NextResponse.json(await response.json());
    } catch { /* Offline-safe admin demo fallback. */ }
  }
  return NextResponse.json(organizationSnapshot, { headers: { "X-LeakGuard-Source": "demo" } });
}
