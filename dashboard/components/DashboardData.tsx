"use client";

import { useEffect, useState } from "react";
import { DebtChart, FpChart } from "./Charts";
import { loadFpRate, loadTrend } from "@/lib/api";
import { sampleFp, sampleTrend } from "@/lib/sample";

export function DebtPanel() {
  const [data, setData] = useState(sampleTrend);
  useEffect(() => { void loadTrend().then(setData); }, []);
  return <DebtChart data={data}/>;
}
export function FpPanel() {
  const [data, setData] = useState(sampleFp);
  useEffect(() => { void loadFpRate().then(setData); }, []);
  return <FpChart data={data}/>;
}
