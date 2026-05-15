import { useMemo, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

interface Props { snapshot: SviSnapshot; baseSpreadBps?: number }

export default function StrikeGrid({ snapshot, baseSpreadBps = 200 }: Props) {
  const [stepPct, setStepPct] = useState(2);

  const rows = useMemo(() => {
    const F = snapshot.forward;
    const T = snapshot.expirySec ? Math.max(snapshot.expirySec - Date.now() / 1000, 60) / (365 * 86400) : 1 / 12;
    const sqrtT = Math.sqrt(T);
    const halfSpread = (baseSpreadBps / 10000) / 2;
    const out: { strike: number; k: number; sigma: number; pCall: number; pPut: number; askCall: number; bidCall: number; askPut: number; bidPut: number }[] = [];
    for (let pct = -16; pct <= 16; pct += stepPct) {
      const strike = F * (1 + pct / 100);
      const k = Math.log(strike / F);
      const sigma = iv(snapshot.svi, k, T);
      const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
      const pCall = normCdf(d2);
      const pPut = 1 - pCall;
      out.push({
        strike, k, sigma, pCall, pPut,
        askCall: Math.min(0.99, pCall + halfSpread), bidCall: Math.max(0.01, pCall - halfSpread),
        askPut:  Math.min(0.99, pPut  + halfSpread), bidPut:  Math.max(0.01, pPut  - halfSpread),
      });
    }
    return out;
  }, [snapshot, stepPct, baseSpreadBps]);

  return (
    <div className="strike-grid-wrap">
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)' }}>strike step</span>
        <div className="mode-toggle">
          {[1, 2, 4].map((s) => (
            <button key={s} className={stepPct === s ? 'active' : ''} onClick={() => setStepPct(s)}>{s}%</button>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>
          forward ${snapshot.forward.toFixed(0)} · spread {baseSpreadBps} bps
        </span>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 400 }}>
        <table className="strike-table">
          <thead>
            <tr>
              <th colSpan={2} className="grp-call">CALL bid · ask</th>
              <th>strike</th>
              <th>IV</th>
              <th colSpan={2} className="grp-put">PUT bid · ask</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const atm = Math.abs(r.k) < 0.005;
              return (
                <tr key={r.strike} className={atm ? 'atm-row' : ''}>
                  <td className="num">{(r.bidCall * 100).toFixed(1)}%</td>
                  <td className="num accent">{(r.askCall * 100).toFixed(1)}%</td>
                  <td className="num center">${r.strike.toFixed(0)}{atm ? <span className="atm-tag"> atm</span> : null}</td>
                  <td className="num center">{(r.sigma * 100).toFixed(1)}%</td>
                  <td className="num accent">{(r.askPut * 100).toFixed(1)}%</td>
                  <td className="num">{(r.bidPut * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
