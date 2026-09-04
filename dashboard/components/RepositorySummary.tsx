"use client";

import { useEffect, useMemo, useState } from "react";
import { loadFindings, scanRepository } from "@/lib/api";
import { sampleReport } from "@/lib/sample";

export function RepositorySummary() {
  const [report, setReport] = useState(sampleReport);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  useEffect(() => { void loadFindings().then(setReport).finally(() => setLoading(false)); }, []);
  const total = report.summary.total ?? report.findings.length;
  const definite = report.summary.definite ?? report.findings.filter((item) => item.confidence === "definite").length;
  const likely = report.summary.likely ?? report.findings.filter((item) => item.confidence === "likely").length;
  const health = Math.max(0, 100 - definite * 12 - likely * 6);
  const resources = useMemo(() => Object.entries(report.findings.reduce<Record<string, number>>((all, finding) => {
    const label = finding.resource.includes("file") ? "File handles" : finding.resource.includes("socket") ? "Sockets" : finding.resource.includes("Connection") ? "Database" : finding.resource;
    all[label] = (all[label] ?? 0) + 1; return all;
  }, {})).slice(0, 3), [report]);
  return <>
    <section className="repo-banner"><div><span className="panel-kicker">Analyzed repository</span><strong>{report.meta?.repository ?? "Unknown repository"}</strong><small>{report.meta?.scope}</small>{scanMessage && <p className="scan-result success">✓ {scanMessage}</p>}{scanError && <p className="scan-result error">× Scan failed: {scanError}</p>}</div><div className="repo-actions"><span className={`source-badge ${report.meta?.source === "live-report" ? "live" : "demo"}`}>{loading ? "Loading report..." : scanning ? "Scanning repository..." : scanMessage ? "Scan complete" : report.meta?.source === "live-report" ? "Live JSON report" : "Demo fixtures"}</span><button className={`scan-button ${scanMessage ? "scanned" : ""}`} disabled={loading || scanning} onClick={() => { setScanning(true); setScanError(""); setScanMessage(""); void scanRepository().then((next) => { setReport(next); setScanMessage(`Scanned ${next.summary.total ?? next.findings.length} findings in ${next.summary.duration_ms ?? 0}ms`); }).catch((reason: unknown) => setScanError(reason instanceof Error ? reason.message : "Scan failed")).finally(() => setScanning(false)); }}>{scanning ? "Scanning..." : scanMessage ? "✓ Scanned" : "Scan now"}</button></div></section>
    <section className="hero-grid"><div className="stats"><div className="stat danger"><small>Open findings</small><b>{total}</b><em>Across analyzed scope</em></div><div className="stat"><small>Definite</small><b>{definite}</b><em>Blocks default CI</em></div><div className="stat"><small>Files scanned</small><b>{report.summary.files_scanned ?? "—"}</b><em>AST analyzed</em></div><div className="stat"><small>Analysis time</small><b>{report.summary.duration_ms ?? "—"}ms</b><em>Engine runtime</em></div></div><div className="risk-card"><div className="risk-ring" style={{background:`conic-gradient(var(--green) 0 ${health}%,#202c3e ${health}%)`}}><span><b>{health}</b><small>Health</small></span></div><div><span className="panel-kicker">Risk score</span><strong>{health >= 80 ? "Repository is healthy" : "Leaks need attention"}</strong><p>{definite} definite · {likely} likely</p></div></div></section>
    <section className="insight-grid">{resources.map(([name, count], index) => <div className="mini-insight" key={name}><span className={`resource-icon ${index === 1 ? "db" : index === 2 ? "socket" : "file"}`}>{name[0]}</span><div><b>{name}</b><small>{count} open</small></div><i style={{width:`${Math.max(12, count / Math.max(total, 1) * 100)}%`}}/></div>)}</section>
  </>;
}
