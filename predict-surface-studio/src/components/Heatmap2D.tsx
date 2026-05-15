import { useMemo } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const STRIKES = 24;
const EXPIRIES = 14;
const K_MIN = -0.45;
const K_MAX = 0.45;

function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, string, string, string][] = [
    [0.0, '#1e3a8a', '#1e3a8a', '#0c1230'],
    [0.25, '#3b82f6', '#06b6d4', '#075985'],
    [0.5, '#10b981', '#22c55e', '#064e3b'],
    [0.75, '#fbbf24', '#f97316', '#713f12'],
    [1.0, '#ef4444', '#fb7185', '#7f1d1d'],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return stops[i][1];
  }
  return stops[stops.length - 1][1];
}

export default function Heatmap2D({ snapshot }: { snapshot: SviSnapshot }) {
  const { cells, ivMin, ivMax } = useMemo(() => {
    const cells: { i: number; j: number; iv: number; k: number; T: number }[] = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < EXPIRIES; j++) {
      const tFrac = j / (EXPIRIES - 1);
      const T = 1 / 24 + tFrac * (180 / 365);
      for (let i = 0; i < STRIKES; i++) {
        const k = K_MIN + (K_MAX - K_MIN) * (i / (STRIKES - 1));
        const sigma = iv(snapshot.svi, k, T);
        cells.push({ i, j, iv: sigma, k, T });
        if (sigma < lo) lo = sigma; if (sigma > hi) hi = sigma;
      }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) hi = lo + 1e-3;
    return { cells, ivMin: lo, ivMax: hi };
  }, [snapshot]);

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${STRIKES}, 1fr)`, gridTemplateRows: `repeat(${EXPIRIES}, 1fr)` }}>
        {cells.map((c) => {
          const t = (c.iv - ivMin) / (ivMax - ivMin);
          return (
            <div
              key={`${c.i}-${c.j}`}
              className="heatmap-cell"
              style={{ background: heatColor(t) }}
              title={`k=${c.k.toFixed(3)}  T=${(c.T * 365).toFixed(1)}d  IV=${(c.iv * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>
      <div className="heatmap-axes">
        <div className="heatmap-x"><span>k = {K_MIN}</span><span>ATM</span><span>k = {K_MAX}</span></div>
        <div className="heatmap-y"><span>1h</span><span>180d</span></div>
      </div>
      <div className="heatmap-scale">
        <span style={{ color: 'var(--blue)' }}>{(ivMin * 100).toFixed(1)}%</span>
        <div className="scale-bar" />
        <span style={{ color: 'var(--red)' }}>{(ivMax * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
