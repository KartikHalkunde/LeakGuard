"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FpPoint, TrendPoint } from "@/lib/types";

export function DebtChart({ data }: { data: TrendPoint[] }) {
  return <div className="chart"><ResponsiveContainer width="100%" height={300}>
    <AreaChart data={data}><defs><linearGradient id="debt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ff5c5c" stopOpacity={0.35}/><stop offset="95%" stopColor="#ff5c5c" stopOpacity={0}/></linearGradient></defs>
      <CartesianGrid stroke="#243044" vertical={false}/><XAxis dataKey="date" stroke="#8391a7"/><YAxis stroke="#8391a7" allowDecimals={false}/><Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155" }}/><Area type="monotone" dataKey="open" stroke="#ff5c5c" fill="url(#debt)" strokeWidth={3}/><Line type="monotone" dataKey="definite" stroke="#fbbf24" strokeWidth={2}/>
    </AreaChart></ResponsiveContainer></div>;
}

export function FpChart({ data }: { data: FpPoint[] }) {
  return <div className="chart"><ResponsiveContainer width="100%" height={330}><LineChart data={data}>
    <CartesianGrid stroke="#243044" vertical={false}/><XAxis dataKey="date" stroke="#8391a7"/><YAxis stroke="#8391a7" unit="%"/><Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155" }}/><Line type="monotone" dataKey="rate" stroke="#34d399" strokeWidth={4} dot={{ fill: "#34d399", r: 5 }}/>
  </LineChart></ResponsiveContainer></div>;
}
