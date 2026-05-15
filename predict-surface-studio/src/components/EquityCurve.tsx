import { useEffect, useMemo, useState } from 'react';
import { fetchManagerPnl, ManagerPnl } from '../lib/predictApi';

const W = 720; const H = 200; const MX = 50; const MY = 20;

export default function EquityCurve({ managerId }: { managerId: string }) {
  const [d, setD] = useState<ManagerPnl | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchManagerPnl(managerId).then((r) => { if (!cancelled) { setD(r); setLoading(false); } });
  }, [managerId]);

  const path = useMemo(() => {
    if (!d || !d.series.length) return null;
    const ys = d.series.map((p) => p.pnl);
    let lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    lo -= pad; hi += pad;
    const tMin = d.series[0].ts, tMax = d.series[d.series.length - 1].ts;
    const xScale = (t: number) => MX + ((t - tMin) / Math.max(tMax - tMin, 1)) * (W - MX * 1.4);
    const yScale = (v: number) => H - MY - ((v - lo) / (hi - lo)) * (H - MY * 2);
    const pts = d.series.map((p) => `${xScale(p.ts).toFixed(1)},${yScale(p.pnl).toFixed(1)}`);
    return { path: 'M' + pts.join(' L'), pts: d.series.map((p) => ({ x: xScale(p.ts), y: yScale(p.pnl), kind: p.kind })), zeroY: yScale(0), lo, hi };
  }, [d]);

  if (loading) return <span className="skeleton" style={{ height: 160 }} />;
  if (!d || !d.series.length) return <div style={{ fontSize: 11, color: 'var(--t3)', padding: 12 }}>No mint/redeem history for this manager.</div>;

  return (
    <div className="equity">
      <div className="equity-stats">
        <div><span>events</span><strong className="mono num">{d.points}</strong></div>
        <div><span>final pnl</span><strong className="mono num" style={{ color: d.finalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{d.finalPnl >= 0 ? '+' : ''}${d.finalPnl.toFixed(2)}</strong></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ height: 160 }}>
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />
        {path && <line className="plot-marker" x1={MX} x2={W - MX * 0.4} y1={path.zeroY} y2={path.zeroY} />}
        {path && <path d={path.path} className={'plot-line ' + (d.finalPnl >= 0 ? 'l2' : 'l4')} />}
        {path && path.pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={p.kind === 'mint' ? 'var(--sui-blue)' : 'var(--green)'} />
        ))}
        {path && <text className="plot-label" x={6} y={MY + 8}>${path.hi.toFixed(0)}</text>}
        {path && <text className="plot-label" x={6} y={H - MY + 4}>${path.lo.toFixed(0)}</text>}
      </svg>
    </div>
  );
}
