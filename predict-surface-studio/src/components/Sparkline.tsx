interface Props {
  data: { ts: number; v: number }[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  label?: string;
}

export default function Sparkline({ data, width = 320, height = 60, color = '#5ca9ff', fillOpacity = 0.12, label }: Props) {
  if (!data || data.length < 2) return <div className="empty" style={{ padding: 12, fontSize: 11 }}>not enough data</div>;
  const sorted = [...data].sort((a, b) => a.ts - b.ts);
  const ys = sorted.map((p) => p.v);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { hi = lo + 1; lo -= 0.01; }
  const tMin = sorted[0].ts, tMax = sorted[sorted.length - 1].ts;
  const xScale = (t: number) => 4 + ((t - tMin) / Math.max(tMax - tMin, 1)) * (width - 8);
  const yScale = (v: number) => height - 6 - ((v - lo) / (hi - lo)) * (height - 12);
  const pts = sorted.map((p) => `${xScale(p.ts).toFixed(1)},${yScale(p.v).toFixed(1)}`);
  const path = 'M' + pts.join(' L');
  const fillPath = path + ` L ${xScale(tMax).toFixed(1)},${(height - 4).toFixed(1)} L ${xScale(tMin).toFixed(1)},${(height - 4).toFixed(1)} Z`;
  const last = sorted[sorted.length - 1];

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <path d={fillPath} fill={color} opacity={fillOpacity} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
        <circle cx={xScale(last.ts)} cy={yScale(last.v)} r={2.5} fill={color} />
      </svg>
      <div className="sparkline-foot">
        {label ? <span className="spk-label">{label}</span> : null}
        <span className="spk-min">{lo.toFixed(4)}</span>
        <span className="spk-max">{hi.toFixed(4)}</span>
        <span className="spk-now">now {last.v.toFixed(4)}</span>
      </div>
    </div>
  );
}
