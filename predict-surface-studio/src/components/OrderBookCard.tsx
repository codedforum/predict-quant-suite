import { useEffect, useState } from 'react';
import { fetchOrderbook, Orderbook, SviSnapshot } from '../lib/predictApi';

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

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 280 }} /></div>;
  if (!d || !d.rows.length) return <div className="empty">No on-chain quotes returned.</div>;

  return (
    <div style={{ overflow: 'auto', maxHeight: 480 }}>
      <table className="strike-table">
        <thead>
          <tr>
            <th colSpan={2} className="grp-call">CALL bid · ask</th>
            <th>strike</th>
            <th colSpan={2} className="grp-put">PUT bid · ask</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => {
            const isAtm = Math.abs(r.strike - d.forward) / d.forward < 0.005;
            return (
              <tr key={r.strike} className={isAtm ? 'atm-row' : ''}>
                <td className="num">{r.callBid != null ? `${(r.callBid * 100).toFixed(1)}%` : '-'}</td>
                <td className="num accent">{r.callAsk != null ? `${(r.callAsk * 100).toFixed(1)}%` : '-'}</td>
                <td className="num center">${r.strike.toFixed(0)}{isAtm ? <span className="atm-tag"> atm</span> : null}</td>
                <td className="num accent">{r.putAsk != null ? `${(r.putAsk * 100).toFixed(1)}%` : '-'}</td>
                <td className="num">{r.putBid != null ? `${(r.putBid * 100).toFixed(1)}%` : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)' }}>
        Live quotes via <code>predict::get_trade_amounts</code> devInspect on the live Predict object. Forward ${d.forward.toFixed(0)}.
      </div>
    </div>
  );
}
