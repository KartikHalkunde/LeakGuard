import Link from "next/link";

const links = [["/", "Leak debt"], ["/findings", "Findings"], ["/fp-rate", "FP rate"], ["/cfg", "CFG view"]];

export function Nav() {
  return <aside className="sidebar">
    <div className="brand"><span className="shield">L</span><div><strong>LeakGuard</strong><small>Control plane</small></div></div>
    <nav>{links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}</nav>
    <div className="status"><span /> Analyzer online</div>
  </aside>;
}
