import { useMemo, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

// Abramowitz-Stegun normal CDF (same approximation as the binary StrikeGrid).
function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

interface Props { snapshot: SviSnapshot; baseSpreadBps?: number }

// A RANGE (vertical) position pays out if the price finishes BETWEEN lo and hi
// at expiry: a structured product / spread, the predict::mint_range instrument.
// Its fair value is the digital-box probability P(lo < S_T < hi), which is the
// difference of two binary call probabilities under the same SVI surface.
export default function RangeGrid({ snapshot, baseSpreadBps = 200 }: Props) {
  const [widthPct, setWidthPct] = useState(2);

  const rows = useMemo(() => {
    const F = snapshot.forward;
    const T = snapshot.expirySec ? Math.max(snapshot.expirySec - Date.now() / 1000, 60) / (365 * 86400) : 1 / 12;
    const sqrtT = Math.sqrt(T);
    const halfSpread = (baseSpreadBps / 10000) / 2;
    const W = F * (widthPct / 100);
    const pAbove = (K: number) => {
      const k = Math.log(K / F);
      const sigma = iv(snapshot.svi, k, T);
      const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
      return normCdf(d2); // P(S_T > K)
    };
    const out: { lo: number; hi: number; mid: number; prob: number; ask: number; payout: number }[] = [];
    for (let pct = -12; pct <= 12; pct += widthPct) {
      const mid = F * (1 + pct / 100);
      const lo = mid - W / 2, hi = mid + W / 2;
      const prob = Math.max(0, pAbove(lo) - pAbove(hi)); // P(lo < S_T < hi)
      const ask = Math.min(0.99, Math.max(0.01, prob + halfSpread));
      out.push({ lo, hi, mid, prob, ask, payout: 1 / ask });
    }
    return out;
  }, [snapshot, widthPct, baseSpreadBps]);

  return (
    <div className="strike-grid-wrap">
      <div className="strike-grid-head">
        <span className="sgh-l">band width</span>
        <div className="mode-toggle">
          {[2, 4, 6].map((w) => (
            <button key={w} className={widthPct === w ? 'active' : ''} onClick={() => setWidthPct(w)}>{w}%</button>
          ))}
        </div>
        <span className="sgh-r">range = structured product · predict::mint_range</span>
      </div>
      <div className="strike-grid-scroll">
        <table className="strike-table">
          <thead>
            <tr>
              <th>band (lo – hi)</th>
              <th>width</th>
              <th>P inside</th>
              <th>cost</th>
              <th>payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const spot = snapshot.forward >= r.lo && snapshot.forward <= r.hi;
              return (
                <tr key={r.mid} className={spot ? 'atm-row' : ''}>
                  <td className="num center">${(r.lo / 1000).toFixed(1)}k – ${(r.hi / 1000).toFixed(1)}k{spot ? <span className="atm-tag"> spot</span> : null}</td>
                  <td className="num">${((r.hi - r.lo) / 1000).toFixed(1)}k</td>
                  <td className="num">{(r.prob * 100).toFixed(1)}%</td>
                  <td className="num accent">{(r.ask * 100).toFixed(1)}%</td>
                  <td className="num">{r.payout.toFixed(2)}x</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
