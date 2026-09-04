"use client";

import { useEffect, useState } from "react";
import { DebtChart, FpChart } from "./Charts";
import { loadFpRate, loadTrend } from "@/lib/api";
import { sampleFp, sampleTrend } from "@/lib/sample";

export function DebtPanel() {
  const [data, setData] = useState(sampleTrend);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const refresh = () => { setLoading(true); void loadTrend().then(setData).finally(() => setLoading(false)); };
    refresh();
    window.addEventListener("leakguard:scan-complete", refresh);
    return () => window.removeEventListener("leakguard:scan-complete", refresh);
  }, []);
  return <div className="data-panel">{loading && <span className="data-loading"><i/> Syncing data</span>}<DebtChart data={data}/></div>;
}
export function FpPanel() {
  const [data, setData] = useState(sampleFp);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void loadFpRate().then(setData).finally(() => setLoading(false)); }, []);
  return <div className="data-panel">{loading && <span className="data-loading"><i/> Syncing data</span>}<FpChart data={data}/></div>;
}
