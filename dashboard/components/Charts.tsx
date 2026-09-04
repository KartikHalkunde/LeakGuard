"use client";

import type { FpPoint, TrendPoint } from "@/lib/types";

type Datum = { label: string; value: number };

function points(data: Datum[], width = 760, height = 250): string {
  if (!data.length) return "";
  const max = Math.max(...data.map((item) => item.value), 1);
  return data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - (item.value / max) * (height - 24);
    return `${x},${y}`;
  }).join(" ");
}

function MiniChart({ data, color, suffix = "" }: { data: Datum[]; color: string; suffix?: string }) {
  const line = points(data);
  const coordinates = line.split(" ");
  const area = line ? `0,250 ${line} 760,250` : "";
  return <div className="fast-chart">
    <svg viewBox="0 0 760 280" role="img" aria-label="Trend chart" preserveAspectRatio="none">
      {[50, 100, 150, 200, 250].map((y) => <line key={y} x1="0" x2="760" y1={y} y2={y} className="grid-line"/>)}
      <polygon points={area} fill={color} opacity="0.10"/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="4" vectorEffect="non-scaling-stroke"/>
      {data.map((item, index) => {
        const [x, y] = coordinates[index].split(",");
        return <g key={item.label}><circle cx={x} cy={y} r="5" fill={color}/><text x={x} y="274" textAnchor="middle">{item.label}</text><title>{`${item.label}: ${item.value}${suffix}`}</title></g>;
      })}
    </svg>
  </div>;
}

export function DebtChart({ data }: { data: TrendPoint[] }) {
  return <MiniChart data={data.map((item) => ({ label: item.date, value: item.open }))} color="#ff5c67"/>;
}

export function FpChart({ data }: { data: FpPoint[] }) {
  return <MiniChart data={data.map((item) => ({ label: item.date, value: item.rate }))} color="#34d399" suffix="%"/>;
}
