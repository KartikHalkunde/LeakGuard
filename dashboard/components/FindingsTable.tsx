"use client";

import { useEffect, useState } from "react";
import { fixCommand, loadFindings, scanRepository } from "@/lib/api";
import { sampleReport } from "@/lib/sample";
import type { Finding } from "@/lib/types";

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const command = fixCommand(finding.file);
  const copy = async () => { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return <>
    <tr className={`finding-row ${finding.confidence}`} onClick={() => setOpen(!open)}>
      <td><span className={`dot ${finding.confidence}`}/><strong>{finding.confidence}</strong></td>
      <td><code>{finding.file}:{finding.acquired_at.line}</code><small>{finding.function}()</small></td>
      <td>{finding.resource}<small>{finding.variable}</small></td>
      <td>{finding.reason}</td>
      <td>{finding.fix_available ? <button className="fix" onClick={(event) => { event.stopPropagation(); void copy(); }}>{copied ? "Copied" : "Copy verified fix"}</button> : <span className="muted">Review required</span>}</td>
    </tr>
    {open && <tr className="details"><td colSpan={5}><div className="witness"><div><span>Witness path</span>{finding.leak_path.map((step, index) => <p key={`${step.line}-${index}`}><b>L{step.line}</b>{step.note}</p>)}</div><div><span>Fix suggestion</span><code className="command">{finding.fix_available ? command : "No automatic rewrite is safe for this path."}</code><p className="muted">Automatic fixes are re-analyzed before LeakGuard writes the file.</p></div></div></td></tr>}
  </>;
}

export function FindingsTable() {
  const [report, setReport] = useState(sampleReport);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState("");
  useEffect(() => { void loadFindings().then(setReport).finally(() => setLoading(false)); }, []);
  const scan = () => {
    setScanning(true); setScanStatus(""); setScanError("");
    void scanRepository().then((next) => {
      setReport(next);
      setScanStatus(`Scanned ${next.summary.files_scanned ?? "—"} files · found ${next.summary.total ?? next.findings.length} leaks · ${next.summary.duration_ms ?? 0}ms`);
    }).catch((reason: unknown) => setScanError(reason instanceof Error ? reason.message : "Scan failed")).finally(() => setScanning(false));
  };
  return <div className="table-card"><div className="table-head"><span>{report.summary.total} open findings <small className="table-source">{report.meta?.repository} · {report.meta?.source === "live-report" ? "live report" : "fixtures"}</small></span><div className="findings-actions"><span className="muted">{loading ? <span className="data-loading inline"><i/> Syncing findings</span> : scanStatus ? <span className="scan-result success">✓ {scanStatus}</span> : scanError ? <span className="scan-result error">× {scanError}</span> : "Click a row for its witness path"}</span><button className={`scan-button ${scanStatus ? "scanned" : ""}`} disabled={loading || scanning} onClick={scan}>{scanning ? "Scanning..." : scanStatus ? "✓ Scanned" : "Scan now"}</button></div></div><div className="table-scroll"><table><thead><tr><th>Confidence</th><th>Location</th><th>Resource</th><th>Reason</th><th>Action</th></tr></thead><tbody>{report.findings.map((finding) => <FindingRow finding={finding} key={finding.fingerprint}/>)}</tbody></table></div></div>;
}
