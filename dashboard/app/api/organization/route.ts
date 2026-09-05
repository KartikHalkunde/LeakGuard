import { NextResponse } from "next/server";
import { buildOrganizationSnapshot } from "@/lib/controlPlane";
import { syncGitHub } from "@/lib/githubSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const repository = url.searchParams.get("repository") ?? "all";
  const employee = url.searchParams.get("employee") ?? "all";
  const range = url.searchParams.get("range") ?? "7d";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  let syncError: string | undefined;
  try { await syncGitHub(url.searchParams.get("refresh") === "1"); }
  catch (error) { syncError = error instanceof Error ? error.message : "GitHub sync failed"; }
  const snapshot = buildOrganizationSnapshot({ search, repository, employee, range, page, pageSize });
  return NextResponse.json({ ...snapshot, syncError }, { headers: { "X-LeakGuard-Source": "control-plane", "Cache-Control": "no-store" } });
}
