import { useEffect, useMemo, useState } from 'react';
import { fetchBacktest, BacktestResult } from '../lib/predictApi';

const W = 800; const H = 280; const MX = 56; const MY = 28;

export default function BacktestChart() {
  const [r, setR] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchBacktest().then((res) => { if (!cancelled) { setR(res); setLoading(false); } });
    const id = setInterval(() => fetchBacktest().then((res) => { if (!cancelled) setR(res); }), 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const path = useMemo(() => {
    if (!r || !r.series.length) return { path: '', lo: 0, hi: 0 };
    const ys = r.series.map((p) => p.pnl);
    let lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
    const pad = Math.max((hi - lo) * 0.1, 1);
    lo -= pad; hi += pad;
    const tMin = r.series[0].ts, tMax = r.series[r.series.length - 1].ts;
    const xScale = (t: number) => MX + ((t - tMin) / Math.max(tMax - tMin, 1)) * (W - MX * 1.4);
    const yScale = (v: number) => H - MY - ((v - lo) / (hi - lo)) * (H - MY * 2);
    const pts = r.series.map((p) => `${xScale(p.ts).toFixed(1)},${yScale(p.pnl).toFixed(1)}`);
    return { path: 'M' + pts.join(' L'), lo, hi, zeroY: yScale(0), x0: xScale(tMin), x1: xScale(tMax) };
  }, [r]);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 240 }} /></div>;
  if (!r || !r.series.length) return <div className="empty">Not enough quote history to backtest yet. The bot writes one quote every 15s.</div>;

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="bt-stats">
        <div className="bt-stat"><div className="ds-label">FINAL PNL</div><div className="ds-value" style={{ color: r.finalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.finalPnl >= 0 ? '+' : ''}${r.finalPnl.toFixed(2)}</div></div>
        <div className="bt-stat"><div className="ds-label">TRADES</div><div className="ds-value">{r.trades}</div></div>
        <div className="bt-stat"><div className="ds-label">HIT RATE</div><div className="ds-value">{(r.hitRate * 100).toFixed(0)}%</div></div>
        <div className="bt-stat"><div className="ds-label">EDGE THRESHOLD</div><div className="ds-value">{(r.minEdge * 100).toFixed(1)}%</div></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ height: 240 }}>
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />
        {path.zeroY != null && <line className="plot-marker" x1={MX} x2={W - MX * 0.4} y1={path.zeroY} y2={path.zeroY} />}
        <path d={path.path} className={'plot-line ' + (r.finalPnl >= 0 ? 'l2' : 'l4')} />
        <text className="plot-label" x={6} y={MY + 8}>${(path.hi || 0).toFixed(0)}</text>
        <text className="plot-label" x={6} y={H - MY + 4}>${(path.lo || 0).toFixed(0)}</text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        synthetic backtest: open whenever |edge| over {(r.minEdge * 100).toFixed(1)}%, $100 per trade, hold 4 ticks or until edge inverts. Educational, not a strategy claim.
      </div>
    </div>
  );
}
