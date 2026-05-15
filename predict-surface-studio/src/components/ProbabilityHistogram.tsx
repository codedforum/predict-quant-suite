import { useMemo } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

const W = 800;
const H = 240;
const MX = 50;
const MY = 22;

export default function ProbabilityHistogram({ snapshot }: { snapshot: SviSnapshot }) {
  const { bars, F, T, atmIv } = useMemo(() => {
    const F = snapshot.forward || 79000;
    const T = snapshot.expirySec ? Math.max(snapshot.expirySec - Date.now() / 1000, 60) / (365 * 86400) : 1 / 12;
    const atmIv = iv(snapshot.svi, 0, T);
    // 21 bars from -15% to +15% of forward in 1.5%-wide bins
    const stepPct = 1.5;
    const range = 15;
    const bars: { lower: number; upper: number; mid: number; p: number }[] = [];
    for (let pct = -range; pct < range; pct += stepPct) {
      const lower = F * (1 + pct / 100);
      const upper = F * (1 + (pct + stepPct) / 100);
      const mid = F * (1 + (pct + stepPct / 2) / 100);
      const kLow = Math.log(lower / F);
      const kHi  = Math.log(upper / F);
      const sigLow = iv(snapshot.svi, kLow, T);
      const sigHi  = iv(snapshot.svi, kHi, T);
      const sqrtT = Math.sqrt(T);
      const d2Low = (-kLow - 0.5 * sigLow * sigLow * T) / Math.max(sigLow * sqrtT, 1e-9);
      const d2Hi  = (-kHi  - 0.5 * sigHi  * sigHi  * T) / Math.max(sigHi  * sqrtT, 1e-9);
      const p = normCdf(d2Low) - normCdf(d2Hi);
      bars.push({ lower, upper, mid, p });
    }
    return { bars, F, T, atmIv };
  }, [snapshot]);

  const maxP = Math.max(...bars.map((b) => b.p), 0.01);
  const xScale = (i: number) => MX + (i / (bars.length - 1)) * (W - MX * 1.4);
  const yScale = (p: number) => H - MY - (p / maxP) * (H - MY * 2);
  const barW = (W - MX * 1.4) / bars.length - 2;
  const fIdx = bars.findIndex((b) => b.lower <= F && F < b.upper);

  return (
    <div className="ph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none" style={{ height: 220 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="plot-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
        ))}
        <line className="plot-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
        <line className="plot-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />

        {bars.map((b, i) => {
          const t = b.p / maxP;
          const isATM = i === fIdx;
          const fill = isATM ? '#5ca9ff' : `rgba(41, 141, 255, ${0.25 + t * 0.55})`;
          return (
            <g key={i}>
              <rect x={xScale(i) - barW / 2} y={yScale(b.p)} width={barW} height={H - MY - yScale(b.p)}
                fill={fill} stroke={isATM ? '#5ca9ff' : 'none'} strokeWidth={isATM ? 1 : 0} rx={2} />
              {b.p > 0.04 && (
                <text x={xScale(i)} y={yScale(b.p) - 4} textAnchor="middle" className="plot-readout" style={{ fontSize: 9 }}>
                  {(b.p * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}

        {fIdx >= 0 && <line className="plot-marker" x1={xScale(fIdx)} x2={xScale(fIdx)} y1={MY} y2={H - MY} />}
        <text className="plot-label" x={MX} y={H - 6}>${(bars[0].lower / 1000).toFixed(0)}k</text>
        <text className="plot-label" x={W - MX * 0.4} y={H - 6} textAnchor="end">${(bars[bars.length - 1].upper / 1000).toFixed(0)}k</text>
        <text className="plot-readout" x={W - MX * 0.4} y={MY + 10} textAnchor="end">F = ${F.toFixed(0)} · ATM IV {(atmIv * 100).toFixed(1)}% · {(T * 365).toFixed(1)}d</text>
      </svg>
      <div className="ph-foot">Implied probability that BTC settles in each ${(bars[0].upper - bars[0].lower).toFixed(0)} window at expiry, computed from the SVI surface.</div>
    </div>
  );
}
