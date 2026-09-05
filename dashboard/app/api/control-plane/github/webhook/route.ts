import { NextResponse } from "next/server";
import { upsertPerson, upsertRepository, upsertWorkflowRun, verifySignature } from "@/lib/controlPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid GitHub signature" }, { status: 401 });
  }
  const payload = JSON.parse(body) as Record<string, unknown>;
  const repository = (payload.repository ?? {}) as Record<string, unknown>;
  upsertRepository(repository);
  const fullName = typeof repository.full_name === "string" ? repository.full_name : "unknown/unknown";
  const sender = (payload.sender ?? {}) as Record<string, unknown>;
  upsertPerson(sender, fullName);
  if (request.headers.get("x-github-event") === "workflow_run") {
    upsertWorkflowRun((payload.workflow_run ?? {}) as Record<string, unknown>, fullName);
  }
  return NextResponse.json({ accepted: true });
}
