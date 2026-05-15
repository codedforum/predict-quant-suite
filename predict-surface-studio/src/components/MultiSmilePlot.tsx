import { useMemo } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const W = 800;
const H = 360;
const MX = 56;
const MY = 28;
const N = 80;
const K_MIN = -0.6;
const K_MAX = 0.6;

const COLORS = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--bad)', '#c084fc'];

interface Curve { name: string; pts: string; ivs: number[]; color: string; }

export default function MultiSmilePlot({ oracles, selectedIdx }: { oracles: SviSnapshot[]; selectedIdx: number }) {
  const { curves, ivMin, ivMax } = useMemo(() => {
    const ks = Array.from({ length: N }, (_, i) => K_MIN + (i / (N - 1)) * (K_MAX - K_MIN));
    let lo = Infinity, hi = -Infinity;
    const data: Curve[] = oracles.map((o, i) => {
      const T = o.expirySec
        ? Math.max(o.expirySec - Date.now() / 1000, 60) / (365 * 86400)
        : 1 / 12;
      const ivs = ks.map((k) => iv(o.svi, k, T));
      ivs.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
      return { name: o.oracleId.slice(0, 8) + '...', ivs, pts: '', color: COLORS[i % COLORS.length] };
    });
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-3) hi = lo + 1e-3;
    const yScale = (v: number) => H - MY - ((v - lo) / (hi - lo)) * (H - MY * 2);
    const xScale = (k: number) => MX + ((k - K_MIN) / (K_MAX - K_MIN)) * (W - MX * 1.4);
    data.forEach((c) => {
      c.pts = 'M' + ks.map((k, i) => `${xScale(k).toFixed(1)},${yScale(c.ivs[i]).toFixed(1)}`).join(' L');
    });
    return { curves: data, ivMin: lo, ivMax: hi };
  }, [oracles]);

  const xMid = MX + (W - MX * 1.4) / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ flex: 1, minHeight: 0 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="plot-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
        ))}
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />
        <line className="plot-marker" x1={xMid} x2={xMid} y1={MY} y2={H - MY} />
        <text className="plot-label" x={xMid + 4} y={MY + 12}>ATM</text>
        {curves.map((c, i) => (
          <path key={i} d={c.pts} className={'plot-line'} style={{ stroke: c.color, opacity: i === selectedIdx ? 1 : 0.45, strokeWidth: i === selectedIdx ? 2.5 : 1.5 }} />
        ))}
        <text className="plot-label" x={MX} y={H - 10}>k = {K_MIN}</text>
        <text className="plot-label" x={W - MX * 0.4} y={H - 10} textAnchor="end">k = +{K_MAX}</text>
        <text className="plot-label" x={6} y={MY + 8}>{(ivMax * 100).toFixed(0)}%</text>
        <text className="plot-label" x={6} y={H - MY + 4}>{(ivMin * 100).toFixed(0)}%</text>
      </svg>
      <div className="legend">
        {curves.map((c, i) => (
          <span key={i} className="legend-item" style={{ opacity: i === selectedIdx ? 1 : 0.5 }}>
            <span className="legend-swatch" style={{ background: c.color }} />
            #{i + 1} {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}
