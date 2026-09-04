"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [["/", "Overview"], ["/employees", "Employees"], ["/repositories", "Repositories"], ["/incidents", "Incidents"]];

export function Nav() {
  const pathname = usePathname();
  const [target, setTarget] = useState("");
  useEffect(() => setTarget(""), [pathname]);
  return <>
    <aside className="sidebar">
      <div className="brand"><span className="shield">L</span><div><strong>LeakGuard</strong><small>Organization Admin</small></div></div>
      <nav>{links.map(([href, label]) => <Link className={pathname === href ? "active" : ""} href={href} key={href} onClick={() => { if (pathname !== href) setTarget(label); }}>{label}</Link>)}</nav>
      <div className="status"><span/> GitHub enforcement online</div>
    </aside>
    {target && <div className="navigation-loading" role="status"><div className="loader-orbit"><i/><i/><i/></div><strong>Loading {target}</strong><small>Fetching repository analysis...</small></div>}
  </>;
}
