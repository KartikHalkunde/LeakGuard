import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GitHubRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
  updated_at: string;
};

export async function GET() {
  const repository = process.env.LEAKGUARD_GITHUB_REPOSITORY ?? "KartikHalkunde/VH26-CodeBlooded";
  const branch = process.env.LEAKGUARD_GITHUB_BRANCH ?? "nikita";
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs?branch=${branch}&per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "LeakGuard-Dashboard" },
      next: { revalidate: 30 },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const payload = await response.json() as { workflow_runs: GitHubRun[] };
    const latest = (name: string) => payload.workflow_runs.find((run) => run.name === name) ?? null;
    return NextResponse.json({ repository, branch, provider: "GitHub cloud", ci: latest("CI"), demo: latest("Demo Leak Gate") });
  } catch (reason) {
    return NextResponse.json({ repository, branch, provider: "GitHub cloud", error: reason instanceof Error ? reason.message : "Unavailable", ci: null, demo: null });
  }
}
