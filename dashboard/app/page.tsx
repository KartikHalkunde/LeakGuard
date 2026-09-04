import { DebtPanel } from "@/components/DashboardData";
import { RepositorySummary } from "@/components/RepositorySummary";

export default function Home() {
  return <><span className="eyebrow">Repository health</span><h1 className="page-title">Leak debt, with proof.</h1><p className="subtitle">One engine follows every resource from acquisition to every reachable exit. Repository identity and data source are always visible.</p><RepositorySummary/><div className="section-row"><div><span className="panel-kicker">7 day trend</span><h2 className="section-title">Open resource debt</h2></div><span className="trend-good">Demo history until control plane is connected</span></div><DebtPanel/></>;
}
