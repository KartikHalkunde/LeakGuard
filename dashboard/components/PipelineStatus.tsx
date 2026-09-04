"use client";

import { useEffect, useState } from "react";

type Run = { id: number; status: string; conclusion: string | null; html_url: string; head_sha: string; updated_at: string };
type Status = { repository: string; branch: string; provider: string; ci: Run | null; demo: Run | null; error?: string };

function RunCard({ title, run, expectedFailure = false }: { title: string; run: Run | null; expectedFailure?: boolean }) {
  const state = run?.conclusion ?? run?.status ?? "unavailable";
  const tone = state === "success" ? "success" : state === "failure" ? "failure" : "pending";
  return <a className={`pipeline-run ${tone}`} href={run?.html_url ?? "#"} target="_blank" rel="noreferrer">
    <span className="run-icon">{state === "success" ? "✓" : state === "failure" ? "×" : "…"}</span>
    <div><small>{title}</small><strong>{state}</strong><em>{expectedFailure && state === "failure" ? "Correctly blocked 10 seeded leaks" : run ? `Commit ${run.head_sha.slice(0, 7)}` : "Status unavailable"}</em></div>
  </a>;
}

export function PipelineStatus() {
  const [data, setData] = useState<Status | null>(null);
  useEffect(() => { void fetch("/api/ci").then((response) => response.json()).then(setData).catch(() => setData(null)); }, []);
  return <section className="pipeline-card"><div className="pipeline-heading"><div><span className="panel-kicker">CI/CD enforcement</span><h2 className="section-title">Live GitHub gates</h2></div><div className="cloud-label"><i/>{data?.provider ?? "Loading GitHub cloud..."}<small>{data ? `${data.repository} · ${data.branch}` : ""}</small></div></div><div className="pipeline-grid"><RunCard title="Production CI" run={data?.ci ?? null}/><RunCard title="Demo Leak Gate" run={data?.demo ?? null} expectedFailure/></div>{data?.error && <p className="pipeline-error">GitHub status temporarily unavailable: {data.error}</p>}</section>;
}
