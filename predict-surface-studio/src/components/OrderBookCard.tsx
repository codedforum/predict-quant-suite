import { useEffect, useMemo, useState } from 'react';
import { fetchOrderbook, Orderbook, SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

export default function OrderBookCard({ oracle }: { oracle: SviSnapshot }) {
  const [d, setD] = useState<Orderbook | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => { const r = await fetchOrderbook(oracle.oracleId); if (!cancelled) { setD(r); setLoading(false); } };
    tick();
    const id = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [oracle.oracleId]);

  // Compute BSM fair value per row from the SVI surface for "fair vs market" comparison
  const enriched = useMemo(() => {
    if (!d) return [];
    const F = d.forward;
    const T = (d.expiry - Date.now()) / (365 * 86400 * 1000);
    return d.rows.map((r) => {
      const k = Math.log(r.strike / F);
      const sigma = iv(oracle.svi, k, T);
      const sqrtT = Math.sqrt(T);
      const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
      const callFair = normCdf(d2);
      const putFair = 1 - callFair;
      const callEdge = r.callAsk != null ? callFair - r.callAsk : null;
      const putEdge  = r.putAsk  != null ? putFair  - r.putAsk  : null;
      return { ...r, callFair, putFair, callEdge, putEdge };
    });
  }, [d, oracle]);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 280 }} /></div>;
  if (!d || !d.rows.length) return <div className="empty">No on-chain quotes returned.</div>;

  return (
    <div style={{ overflow: 'auto', maxHeight: 480 }}>
      <table className="strike-table">
        <thead>
          <tr>
            <th>edge</th>
            <th colSpan={2} className="grp-call">CALL bid · ask</th>
            <th>strike</th>
            <th colSpan={2} className="grp-put">PUT bid · ask</th>
            <th>edge</th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const isAtm = Math.abs(r.strike - d.forward) / d.forward < 0.005;
            const edgeTag = (e: number | null) => {
              if (e == null) return '-';
              const pct = e * 100;
              const cls = pct > 1.5 ? 'edge-good' : pct < -1.5 ? 'edge-bad' : 'edge-neutral';
              return <span className={cls}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>;
            };
            return (
              <tr key={r.strike} className={isAtm ? 'atm-row' : ''}>
                <td className="num">{edgeTag(r.callEdge)}</td>
                <td className="num">{r.callBid != null ? `${(r.callBid * 100).toFixed(1)}%` : '-'}</td>
                <td className="num accent">{r.callAsk != null ? `${(r.callAsk * 100).toFixed(1)}%` : '-'}</td>
                <td className="num center">${r.strike.toFixed(0)}{isAtm ? <span className="atm-tag"> atm</span> : null}</td>
                <td className="num accent">{r.putAsk != null ? `${(r.putAsk * 100).toFixed(1)}%` : '-'}</td>
                <td className="num">{r.putBid != null ? `${(r.putBid * 100).toFixed(1)}%` : '-'}</td>
                <td className="num">{edgeTag(r.putEdge)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)' }}>
        Edge = (BSM fair from SVI surface) - (chain ask). Green = chain underpriced (buy edge). Red = chain overpriced. Forward ${d.forward.toFixed(0)}.
      </div>
    </div>
  );
}
