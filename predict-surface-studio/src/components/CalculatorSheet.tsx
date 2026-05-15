import { useMemo, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

// Abramowitz-Stegun 26.2.17 normal CDF approximation
function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

type Side = 'CALL' | 'PUT' | 'RANGE';

export default function CalculatorSheet({ oracles, selectedIdx, onSelect, onClose }: {
  oracles: SviSnapshot[];
  selectedIdx: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const oracle = oracles[selectedIdx];
  const [strike, setStrike] = useState(() => oracle ? Math.round(oracle.forward / 1000) * 1000 : 80000);
  const [strikeUpper, setStrikeUpper] = useState(() => oracle ? Math.round(oracle.forward / 1000) * 1000 + 2000 : 82000);
  const [size, setSize] = useState(100);
  const [side, setSide] = useState<Side>('CALL');

  const result = useMemo(() => {
    if (!oracle) return null;
    const F = oracle.forward;
    const T = oracle.expirySec
      ? Math.max(oracle.expirySec - Date.now() / 1000, 60) / (365 * 86400)
      : 1 / 12;
    const sqrtT = Math.sqrt(T);
    const k = Math.log(strike / F);
    const sigma = iv(oracle.svi, k, T);
    const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
    const digitalCall = normCdf(d2);

    if (side === 'RANGE') {
      // Vertical range pays $1 if S_T in (lower, upper). Pricing = digital(lower) - digital(upper)
      const lo = Math.min(strike, strikeUpper);
      const hi = Math.max(strike, strikeUpper);
      const kLo = Math.log(lo / F), kHi = Math.log(hi / F);
      const sigLo = iv(oracle.svi, kLo, T);
      const sigHi = iv(oracle.svi, kHi, T);
      const d2Lo = (-kLo - 0.5 * sigLo * sigLo * T) / Math.max(sigLo * sqrtT, 1e-9);
      const d2Hi = (-kHi - 0.5 * sigHi * sigHi * T) / Math.max(sigHi * sqrtT, 1e-9);
      const probInRange = normCdf(d2Lo) - normCdf(d2Hi);
      return {
        sigma, probInTheMoney: probInRange, cost: probInRange * size,
        maxPayout: size, profit: size - probInRange * size,
        T, F, k, kLo, kHi, lo, hi, isRange: true,
      };
    }

    const probInTheMoney = side === 'CALL' ? digitalCall : 1 - digitalCall;
    return {
      sigma, probInTheMoney, cost: probInTheMoney * size,
      maxPayout: size, profit: size - probInTheMoney * size,
      T, F, k, isRange: false,
    };
  }, [oracle, strike, strikeUpper, size, side]);

  function normInverse(p: number): number {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const pl = 0.02425, ph = 1 - pl;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p <= ph) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Trade Calculator</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          <div className="field">
            <label>Oracle (expiry)</label>
            <select value={selectedIdx} onChange={(e) => onSelect(parseInt(e.target.value, 10))}>
              {oracles.map((o, i) => (
                <option key={i} value={i}>
                  #{i + 1} {o.oracleId.slice(0, 12)}... · {o.expirySec ? new Date(o.expirySec * 1000).toISOString().slice(0, 16).replace('T', ' ') : 'live'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Side</label>
            <div className="toggle-group">
              <button className={side === 'CALL'  ? 'active' : ''} onClick={() => setSide('CALL')}>CALL</button>
              <button className={side === 'PUT'   ? 'active' : ''} onClick={() => setSide('PUT')}>PUT</button>
              <button className={side === 'RANGE' ? 'active' : ''} onClick={() => setSide('RANGE')}>RANGE</button>
            </div>
          </div>

          <div className="field">
            <label>{side === 'RANGE' ? 'Lower strike (USD)' : 'Strike (USD)'}</label>
            <input type="number" value={strike} step="500" onChange={(e) => setStrike(parseFloat(e.target.value) || 0)} />
          </div>

          {side === 'RANGE' && (
            <div className="field">
              <label>Upper strike (USD)</label>
              <input type="number" value={strikeUpper} step="500" onChange={(e) => setStrikeUpper(parseFloat(e.target.value) || 0)} />
            </div>
          )}

          <div className="field">
            <label>Size (dUSDC max payout)</label>
            <input type="number" value={size} step="10" min="0" onChange={(e) => setSize(parseFloat(e.target.value) || 0)} />
          </div>

          {result && (() => {
            // Greeks for binary digital. Approximate via Black-Scholes formulas.
            // d2 = (-k - 0.5 σ² T) / (σ √T)
            // pdf(d2) = exp(-d2²/2) / √(2π)
            // For binary CALL paying 1 if S_T > K:
            //   delta ≈ pdf(d2) / (F σ √T)
            //   gamma ≈ -d1 · pdf(d2) / (F² σ² T)  where d1 = d2 + σ√T
            //   vega  ≈ -d1 · pdf(d2) / σ
            //   theta ≈ pdf(d2) · (k / (T σ √T) + (1 - d1·k) / (2 T))   (per-year)
            const F = result.F, T = result.T, sigma = result.sigma, k = result.k;
            const sqrtT = Math.sqrt(T);
            const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
            const d1 = d2 + sigma * sqrtT;
            const pdf = Math.exp(-d2 * d2 / 2) / Math.sqrt(2 * Math.PI);
            const sign = side === 'CALL' ? 1 : -1;
            const delta = sign * pdf / Math.max(F * sigma * sqrtT, 1e-9) * size;
            const vega  = sign * (-d1 * pdf / Math.max(sigma, 1e-9)) * 0.01 * size;     // per 1 vol pt
            const theta = sign * (-pdf * (k / (2 * T) + (sigma * d1) / (2 * sqrtT))) / 365 * size; // per day
            return (
              <div className="calc-result">
                <span className="k">Forward</span><span className="v">${result.F.toFixed(2)}</span>
                <span className="k">Days to expiry</span><span className="v">{(result.T * 365).toFixed(2)}d</span>
                <span className="k">log-moneyness k</span><span className="v">{result.k.toFixed(4)}</span>
                <span className="k">IV at strike</span><span className="v">{(result.sigma * 100).toFixed(2)}%</span>
                <span className="k">P(in the money)</span><span className="v">{(result.probInTheMoney * 100).toFixed(2)}%</span>
                <div className="sep-row" />
                <span className="k">Cost (approx)</span><span className="v big">{result.cost.toFixed(2)} dUSDC</span>
                <span className="k">Max payout</span><span className="v green">{result.maxPayout.toFixed(2)} dUSDC</span>
                <span className="k">Max profit</span><span className="v green">+{result.profit.toFixed(2)}</span>
                <span className="k">Max loss</span><span className="v red">-{result.cost.toFixed(2)}</span>
                <div className="sep-row" />
                <span className="k">Δ delta</span><span className="v">{delta.toFixed(4)} per $1 BTC</span>
                <span className="k">ν vega</span><span className="v">{vega.toFixed(4)} per 1 vol pt</span>
                <span className="k">Θ theta</span><span className="v">{theta.toFixed(4)} per day</span>
              </div>
            );
          })()}

          <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Estimate uses Black-Scholes digital pricing against the live SVI surface. Real DeepBook quotes include the protocol's vault spread on top, so actual cost is typically a few % higher. For exact pricing, call <code style={{ fontSize: 10 }}>predict::get_trade_amounts</code>.
          </p>
        </div>
      </aside>
    </>
  );
}
