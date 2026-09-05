"use client";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** Shade the area under the line. Use on the series the panel is really about. */
  fill?: boolean;
  dashed?: boolean;
};

/** Round the axis top up to a value whose quarters are whole numbers, so the
 *  gridline labels read 0 / 5 / 10 / 15 / 20 rather than 0 / 2.75 / 5.5. */
function niceMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  for (const step of [1, 2, 4, 5, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function LineChart({
  labels, series, unit = "", maxOverride, height = 210, emptyMessage = "No activity in this date range.",
}: {
  labels: string[];
  series: ChartSeries[];
  unit?: string;
  maxOverride?: number;
  height?: number;
  emptyMessage?: string;
}) {
  if (!labels.length || !series.length) return <p className="empty-state">{emptyMessage}</p>;

  const width = 760;
  const pad = { top: 16, right: 18, bottom: 30, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = maxOverride ?? niceMax(Math.max(...series.flatMap((line) => line.values), 1));
  const x = (index: number) => labels.length === 1 ? pad.left + plotWidth / 2 : pad.left + index * plotWidth / (labels.length - 1);
  const y = (value: number) => pad.top + plotHeight - Math.min(value, max) / max * plotHeight;
  const line = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const area = (values: number[]) => `${line(values)} L${x(values.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  // Crowded axes are unreadable, so thin the day labels rather than the data.
  const labelStep = Math.ceil(labels.length / 8);
  const showPoints = labels.length <= 14;

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.map((item) => item.label).join(", ")} by day`}>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = max * (1 - fraction);
          const yPosition = pad.top + fraction * plotHeight;
          return (
            <g key={fraction}>
              <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={yPosition} y2={yPosition} />
              <text className="chart-axis" x={pad.left - 8} y={yPosition + 4} textAnchor="end">{Math.round(value)}{unit}</text>
            </g>
          );
        })}
        {series.map((item) => (
          <g key={item.key}>
            {item.fill && <path d={area(item.values)} fill={item.color} opacity={0.13} />}
            <path d={line(item.values)} fill="none" stroke={item.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={item.dashed ? "6 5" : undefined} />
            {showPoints && item.values.map((value, index) => (
              <circle key={`${item.key}-${index}`} cx={x(index)} cy={y(value)} r={3.4} fill="#0a111b" stroke={item.color} strokeWidth={2}>
                <title>{`${labels[index]} · ${item.label}: ${value}${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {labels.map((label, index) => index % labelStep === 0 || index === labels.length - 1 ? (
          <text className="chart-axis" key={label + index} x={x(index)} y={height - 9} textAnchor="middle">{label}</text>
        ) : null)}
      </svg>
      <ul className="chart-legend">
        {series.map((item) => (
          <li key={item.key}><i style={{ background: item.color }} />{item.label}</li>
        ))}
      </ul>
    </div>
  );
}
