import { useEffect, useState, useMemo } from 'react';
import { fetchRealized, RealizedVol, SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

interface Props { oracle: SviSnapshot }

const W = 800; const H = 280; const MX = 56; const MY = 28;

const WINDOWS: { key: keyof RealizedVol['windows']; days: number; label: string }[] = [
  { key: '5m',  days: 0.0035, label: '5m' },
  { key: '30m', days: 0.021,  label: '30m' },
  { key: '1h',  days: 0.042,  label: '1h' },
  { key: '6h',  days: 0.25,   label: '6h' },
  { key: '24h', days: 1.0,    label: '24h' },
];

export default function VolatilityCone({ oracle }: Props) {
  const [r, setR] = useState<RealizedVol | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRealized(oracle.oracleId).then((res) => { if (!cancelled) { setR(res); setLoading(false); } });
    const id = setInterval(() => fetchRealized(oracle.oracleId).then((res) => { if (!cancelled) setR(res); }), 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [oracle.oracleId]);

  const { realizedPath, ivPath, bandsTop, bandsBot, ymax, hasData } = useMemo(() => {
    if (!r) return { realizedPath: '', ivPath: '', bandsTop: '', bandsBot: '', ymax: 1, hasData: false };
    const realized = WINDOWS.map((w) => ({ days: w.days, vol: r.windows[w.key] ?? NaN, label: w.label }));
    const validVols = realized.map((p) => p.vol).filter((v) => Number.isFinite(v) && v > 0) as number[];
    const ivs = WINDOWS.map((w) => iv(oracle.svi, 0, w.days / 365));
    const all = [...validVols, ...ivs];
    if (!all.length) return { realizedPath: '', ivPath: '', bandsTop: '', bandsBot: '', ymax: 1, hasData: false };
    const ymax = Math.max(...all) * 1.2;
    const xScale = (d: number) => MX + (Math.log(d) - Math.log(WINDOWS[0].days)) / (Math.log(WINDOWS[WINDOWS.length - 1].days) - Math.log(WINDOWS[0].days)) * (W - MX * 1.4);
    const yScale = (v: number) => H - MY - (v / ymax) * (H - MY * 2);
    const realizedPath = 'M' + realized.filter((p) => Number.isFinite(p.vol) && p.vol > 0).map((p) => `${xScale(p.days).toFixed(1)},${yScale(p.vol).toFixed(1)}`).join(' L');
    const ivPath = 'M' + WINDOWS.map((w, i) => `${xScale(w.days).toFixed(1)},${yScale(ivs[i]).toFixed(1)}`).join(' L');
    // simple band: realized * 0.7 (lower) and realized * 1.3 (upper) as a hypothetical "fair" zone
    const bandsTop = 'M' + realized.filter((p) => Number.isFinite(p.vol)).map((p) => `${xScale(p.days).toFixed(1)},${yScale(p.vol * 1.3).toFixed(1)}`).join(' L');
    const bandsBot = 'M' + realized.filter((p) => Number.isFinite(p.vol)).map((p) => `${xScale(p.days).toFixed(1)},${yScale(p.vol * 0.7).toFixed(1)}`).join(' L');
    return { realizedPath, ivPath, bandsTop, bandsBot, ymax, hasData: true };
  }, [r, oracle.svi]);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 220 }} /></div>;
  if (!r || !hasData) return <div className="empty">Need at least 3 price updates to compute realized vol. ({r?.sampleCount ?? 0} so far)</div>;

  const xScale = (d: number) => MX + (Math.log(d) - Math.log(WINDOWS[0].days)) / (Math.log(WINDOWS[WINDOWS.length - 1].days) - Math.log(WINDOWS[0].days)) * (W - MX * 1.4);
  const yScale = (v: number) => H - MY - (v / ymax) * (H - MY * 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ height: 240 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="plot-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
        ))}
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />

        {/* realized vol band */}
        <path d={bandsTop + ' L ' + bandsBot.split('M')[1].split(' L').reverse().join(' L') + ' Z'} fill="rgba(168, 85, 247, 0.10)" />
        <path d={bandsTop} className="plot-line l5" style={{ strokeDasharray: '3 3', opacity: 0.4 }} />
        <path d={bandsBot} className="plot-line l5" style={{ strokeDasharray: '3 3', opacity: 0.4 }} />
        <path d={realizedPath} className="plot-line l5" />

        {/* implied vol from SVI */}
        <path d={ivPath} className="plot-line l1" />

        {/* x labels */}
        {WINDOWS.map((w) => (
          <text key={w.key} className="plot-label" x={xScale(w.days)} y={H - 8} textAnchor="middle">{w.label}</text>
        ))}
        <text className="plot-label" x={6} y={MY + 8}>{(ymax * 100).toFixed(0)}%</text>
        <text className="plot-label" x={6} y={H - MY + 4}>0%</text>
      </svg>
      <div className="legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#c084fc' }} />Realized vol (BTC spot)</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--sui-blue)' }} />Implied vol (Predict SVI ATM)</span>
        <span className="legend-item" style={{ color: 'var(--t3)' }}>{r.sampleCount} price samples</span>
      </div>
    </div>
  );
}
