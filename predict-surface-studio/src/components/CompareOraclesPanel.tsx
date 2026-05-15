import { useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

interface Props { oracles: SviSnapshot[]; selectedIdx: number; onSelect: (i: number) => void }

const ATM_T = 1 / 12;

export default function CompareOraclesPanel({ oracles, selectedIdx, onSelect }: Props) {
  const [bIdx, setBIdx] = useState<number>(() => (selectedIdx + 1) % Math.max(1, oracles.length));

  const a = oracles[selectedIdx];
  const b = oracles[bIdx];
  if (!a || !b) return <div className="empty">Need 2 oracles to compare.</div>;

  const atmA = iv(a.svi, 0, ATM_T);
  const atmB = iv(b.svi, 0, ATM_T);
  const skewA = iv(a.svi, -0.25, ATM_T) - iv(a.svi, 0.25, ATM_T);
  const skewB = iv(b.svi, -0.25, ATM_T) - iv(b.svi, 0.25, ATM_T);

  const rows: [string, number, number][] = [
    ['ATM IV',   atmA, atmB],
    ['25Δ skew', skewA, skewB],
    ['a',        a.svi.a, b.svi.a],
    ['b',        a.svi.b, b.svi.b],
    ['rho',      a.svi.rho, b.svi.rho],
    ['m',        a.svi.m, b.svi.m],
    ['sigma',    a.svi.sigma, b.svi.sigma],
  ];

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="cmp-pickers">
        <div className="cmp-side">
          <div className="cmp-label">ORACLE A (selected)</div>
          <select value={selectedIdx} onChange={(e) => onSelect(parseInt(e.target.value, 10))}>
            {oracles.map((o, i) => <option key={i} value={i}>#{i + 1} {o.oracleId.slice(0, 12)}...</option>)}
          </select>
        </div>
        <div className="cmp-side">
          <div className="cmp-label">ORACLE B</div>
          <select value={bIdx} onChange={(e) => setBIdx(parseInt(e.target.value, 10))}>
            {oracles.map((o, i) => <option key={i} value={i}>#{i + 1} {o.oracleId.slice(0, 12)}...</option>)}
          </select>
        </div>
      </div>

      <table className="cmp-table">
        <thead>
          <tr><th>metric</th><th className="ca">A</th><th className="cb">B</th><th>delta</th></tr>
        </thead>
        <tbody>
          {rows.map(([k, va, vb]) => {
            const d = va - vb;
            const pct = ['ATM IV', '25Δ skew'].includes(k);
            return (
              <tr key={k}>
                <td className="cmp-key">{k}</td>
                <td className="ca mono num">{pct ? (va * 100).toFixed(2) + '%' : va.toFixed(6)}</td>
                <td className="cb mono num">{pct ? (vb * 100).toFixed(2) + '%' : vb.toFixed(6)}</td>
                <td className="mono num" style={{ color: d > 0 ? 'var(--sui-blue)' : d < 0 ? 'var(--red)' : 'var(--t3)' }}>
                  {d > 0 ? '+' : ''}{pct ? (d * 100).toFixed(2) + '%' : d.toFixed(6)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
