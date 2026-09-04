import { DebtPanel } from "@/components/DashboardData";

export default function Home() {
  return <><span className="eyebrow">Repository health</span><h1 className="page-title">Leak debt is moving down.</h1><p className="subtitle">One engine follows every resource from acquisition to every reachable exit. The control plane shows whether the team is paying down risk without adding noise.</p><section className="stats"><div className="stat danger"><small>Open findings</small><b>3</b></div><div className="stat"><small>Definite</small><b>1</b></div><div className="stat"><small>Files scanned</small><b>12</b></div><div className="stat"><small>Analysis time</small><b>84ms</b></div></section><h2 className="section-title">Open resource debt</h2><DebtPanel/></>;
}
