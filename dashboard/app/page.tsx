import { DebtPanel } from "@/components/DashboardData";
import { RepositorySummary } from "@/components/RepositorySummary";
import { PipelineStatus } from "@/components/PipelineStatus";

export default function Home() {
  return <><span className="eyebrow">Repository health</span><h1 className="page-title">Leak debt, with proof.</h1><p className="subtitle">One engine follows every resource from acquisition to every reachable exit. Repository identity, scan result and cloud enforcement are visible here.</p><RepositorySummary/><PipelineStatus/><div className="section-row"><div><span className="panel-kicker">Scan history</span><h2 className="section-title">Open resource debt</h2></div><span className="trend-good">Updated after every real dashboard scan</span></div><DebtPanel/></>;
}
