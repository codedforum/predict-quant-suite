import { useEffect, useMemo, useState } from 'react';
import { fetchSpread, SpreadQuote } from '../lib/predictApi';

const W = 800;
const H = 320;
const MX = 60;
const MY = 28;

export default function VolArbPlot() {
  const [quotes, setQuotes] = useState<SpreadQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const q = await fetchSpread(300);
      if (cancelled) return;
      setQuotes(q);
      setLoading(false);
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const { predictPath, polyPath, spreadPath, ivMin, ivMax, tMin, tMax, hasPoly } = useMemo(() => {
    if (!quotes.length) return { predictPath: '', polyPath: '', spreadPath: '', ivMin: 0, ivMax: 1, tMin: 0, tMax: 1, hasPoly: false };
    const tMin = quotes[0].ts;
    const tMax = quotes[quotes.length - 1].ts;
    const validPoly = quotes.filter((q) => Number.isFinite(q.polyIv) && q.polyIv > 0);
    const hasPoly = validPoly.length > 0;
    const ivs = quotes.flatMap((q) => [q.predictIv, hasPoly ? q.polyIv : NaN]).filter(Number.isFinite);
    let lo = Math.min(...ivs), hi = Math.max(...ivs);
    const pad = Math.max((hi - lo) * 0.15, 0.01);
    lo = Math.max(0, lo - pad); hi = hi + pad;
    const xScale = (t: number) => MX + ((t - tMin) / Math.max(tMax - tMin, 1)) * (W - MX * 1.4);
    const yScale = (v: number) => H - MY - ((v - lo) / (hi - lo)) * (H - MY * 2);

    const mkPath = (key: 'predictIv' | 'polyIv') => {
      const pts: string[] = [];
      quotes.forEach((q) => {
        const v = q[key];
        if (Number.isFinite(v) && v > 0) pts.push(`${xScale(q.ts).toFixed(1)},${yScale(v).toFixed(1)}`);
      });
      return pts.length ? 'M' + pts.join(' L') : '';
    };
    return {
      predictPath: mkPath('predictIv'),
      polyPath: hasPoly ? mkPath('polyIv') : '',
      spreadPath: '',
      ivMin: lo, ivMax: hi, tMin, tMax, hasPoly,
    };
  }, [quotes]);

  if (loading) return <div className="card-pad"><span className="skeleton" style={{ height: 280 }} /></div>;
  if (!quotes.length) return <div className="empty">No vol-arb quotes logged yet. The bot writes one quote every 15s.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ flex: 1, minHeight: 0 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="plot-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
        ))}
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />
        {polyPath && <path d={polyPath} className="plot-line l3" style={{ opacity: 0.85 }} />}
        <path d={predictPath} className="plot-line l1" />
        <text className="plot-label" x={MX} y={H - 10}>{new Date(tMin).toISOString().slice(11, 19)}</text>
        <text className="plot-label" x={W - MX * 0.4} y={H - 10} textAnchor="end">{new Date(tMax).toISOString().slice(11, 19)}</text>
        <text className="plot-label" x={6} y={MY + 8}>{(ivMax * 100).toFixed(0)}%</text>
        <text className="plot-label" x={6} y={H - MY + 4}>{(ivMin * 100).toFixed(0)}%</text>
      </svg>
      <div className="legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }} />DeepBook Predict (Sui)</span>
        {hasPoly
          ? <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--warn)' }} />Polymarket BTC binary smile</span>
          : <span className="legend-item" style={{ color: 'var(--text-dim)' }}>(Polymarket curve missing - bot may be cold-starting)</span>}
      </div>
    </div>
  );
}
