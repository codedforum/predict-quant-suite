import { useMemo } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const W = 800;
const H = 360;
const MX = 56;
const MY = 28;

export default function TermStructurePlot({ oracles }: { oracles: SviSnapshot[] }) {
  const { atmPath, atmDots, callPath, putPath, ivMin, ivMax, dayMin, dayMax, points } = useMemo(() => {
    const points = oracles
      .filter((o) => o.expirySec)
      .map((o) => {
        const days = (o.expirySec - Date.now() / 1000) / 86400;
        const T = Math.max(days * 86400, 60) / (365 * 86400);
        return {
          days,
          atm: iv(o.svi, 0, T),
          call25: iv(o.svi, 0.25, T),
          put25: iv(o.svi, -0.25, T),
        };
      })
      .sort((a, b) => a.days - b.days);

    if (!points.length) return { atmPath: '', atmDots: [], callPath: '', putPath: '', ivMin: 0, ivMax: 1, dayMin: 0, dayMax: 1, points: [] };

    let lo = Infinity, hi = -Infinity;
    points.forEach((p) => {
      [p.atm, p.call25, p.put25].forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
    });
    const padIv = (hi - lo) * 0.15 || 0.05;
    lo = Math.max(0, lo - padIv); hi = hi + padIv;
    const dayMin = Math.min(...points.map((p) => p.days));
    const dayMax = Math.max(...points.map((p) => p.days));
    const dayPad = Math.max((dayMax - dayMin) * 0.05, 0.05);

    const xScale = (d: number) => MX + ((d - (dayMin - dayPad)) / ((dayMax + dayPad) - (dayMin - dayPad))) * (W - MX * 1.4);
    const yScale = (v: number) => H - MY - ((v - lo) / (hi - lo)) * (H - MY * 2);

    const mkPath = (vals: number[]) => 'M' + points.map((p, i) => `${xScale(p.days).toFixed(1)},${yScale(vals[i]).toFixed(1)}`).join(' L');
    const atmDots = points.map((p) => ({ x: xScale(p.days), y: yScale(p.atm), label: p.atm }));

    return {
      atmPath: mkPath(points.map((p) => p.atm)),
      atmDots,
      callPath: mkPath(points.map((p) => p.call25)),
      putPath: mkPath(points.map((p) => p.put25)),
      ivMin: lo, ivMax: hi, dayMin, dayMax, points,
    };
  }, [oracles]);

  if (!points.length) return <div className="empty">No oracles with expiries to plot.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ flex: 1, minHeight: 0 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="plot-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
        ))}
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />

        <path d={putPath}  className="plot-line l4" style={{ opacity: 0.6 }} />
        <path d={callPath} className="plot-line l3" style={{ opacity: 0.6 }} />
        <path d={atmPath}  className="plot-line l1" />

        {atmDots.map((d, i) => (
          <g key={i}>
            <circle cx={d.x} cy={d.y} r={4} className="plot-dot" />
            <text className="plot-readout" x={d.x} y={d.y - 10} textAnchor="middle">{(d.label * 100).toFixed(1)}%</text>
          </g>
        ))}

        <text className="plot-label" x={MX} y={H - 10}>{dayMin.toFixed(2)}d</text>
        <text className="plot-label" x={W - MX * 0.4} y={H - 10} textAnchor="end">{dayMax.toFixed(2)}d</text>
        <text className="plot-label" x={6} y={MY + 8}>{(ivMax * 100).toFixed(0)}%</text>
        <text className="plot-label" x={6} y={H - MY + 4}>{(ivMin * 100).toFixed(0)}%</text>
      </svg>
      <div className="legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }} />ATM (k=0)</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--warn)' }} />25Δ call (k=+0.25)</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--bad)' }} />25Δ put (k=−0.25)</span>
      </div>
    </div>
  );
}
