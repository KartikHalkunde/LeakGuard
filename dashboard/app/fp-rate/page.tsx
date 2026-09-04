import { FpPanel } from "@/components/DashboardData";

export default function FpRatePage() {
  return <><span className="eyebrow">Signal quality</span><h1 className="page-title">The tool gets quieter.</h1><p className="subtitle">Connect the control plane for live history; the values below are a clearly labelled demonstration dataset.</p><div className="repo-banner"><div><span className="panel-kicker">Data source</span><strong>Benchmark demonstration</strong><small>Use NEXT_PUBLIC_CONTROL_PLANE_URL for live triage history</small></div><span className="source-badge demo">Demo history</span></div><section className="stats"><div className="stat"><small>Current FP rate</small><b>3.8%</b></div><div className="stat"><small>30-day change</small><b style={{color:"#34d399"}}>-10.4%</b></div><div className="stat"><small>Triaged</small><b>74</b></div><div className="stat"><small>Baseline entries</small><b>11</b></div></section><FpPanel/></>;
}
