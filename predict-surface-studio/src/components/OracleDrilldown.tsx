import { useEffect, useState } from 'react';
import { fetchOracleDrill, OracleDrill } from '../lib/predictApi';

interface Props { oracleId: string; onClose: () => void }

export default function OracleDrilldown({ oracleId, onClose }: Props) {
  const [d, setD] = useState<OracleDrill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchOracleDrill(oracleId).then((r) => {
      if (!cancelled) { setD(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [oracleId]);

  const expiry = d?.expiry_ms ? new Date(d.expiry_ms) : null;
  const expirySec = d?.expiry_ms ? d.expiry_ms / 1000 : 0;
  const nowSec = Date.now() / 1000;
  const secsLeft = Math.max(0, expirySec - nowSec);
  const daysLeft = secsLeft / 86400;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <h2>Oracle Drilldown</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)', marginBottom: 16, wordBreak: 'break-all' }}>
            {oracleId}
          </div>

          {loading ? (
            <span className="skeleton" style={{ height: 200 }} />
          ) : !d ? (
            <div className="empty">Could not load oracle drilldown.</div>
          ) : (
            <>
              <div className="drill-grid">
                <div className="drill-stat">
                  <div className="ds-label">EXPIRY</div>
                  <div className="ds-value">{expiry ? expiry.toISOString().slice(0, 16).replace('T', ' ') : '-'}</div>
                  <div className="ds-sub">UTC</div>
                </div>
                <div className="drill-stat">
                  <div className="ds-label">TIME LEFT</div>
                  <div className="ds-value">{daysLeft >= 1 ? `${daysLeft.toFixed(2)} days` : `${(secsLeft / 3600).toFixed(1)} hours`}</div>
                  <div className="ds-sub">until settlement</div>
                </div>
                <div className="drill-stat">
                  <div className="ds-label">STATUS</div>
                  <div className="ds-value" style={{ color: d.is_settled ? 'var(--red)' : 'var(--green)' }}>
                    {d.is_settled ? 'SETTLED' : 'LIVE'}
                  </div>
                  <div className="ds-sub">{d.settlement_price ? `at $${d.settlement_price.toFixed(2)}` : 'open for trading'}</div>
                </div>
                <div className="drill-stat">
                  <div className="ds-label">SVI UPDATES (LAST 30)</div>
                  <div className="ds-value">{d.sviHistory.length}</div>
                  <div className="ds-sub">{d.priceHistory.length} price updates</div>
                </div>
              </div>

              <h3>Recent SVI parameter updates</h3>
              <div className="drill-table-wrap">
                <table className="drill-table">
                  <thead>
                    <tr><th>time</th><th>a</th><th>b</th><th>ρ</th><th>m</th><th>σ</th></tr>
                  </thead>
                  <tbody>
                    {d.sviHistory.slice(0, 8).map((s, i) => (
                      <tr key={i}>
                        <td>{new Date(s.ts).toISOString().slice(11, 19)}</td>
                        <td>{s.a.toFixed(6)}</td>
                        <td>{s.b.toFixed(6)}</td>
                        <td style={{ color: s.rho < 0 ? 'var(--red)' : 'var(--t1)' }}>{s.rho.toFixed(4)}</td>
                        <td style={{ color: s.m < 0 ? 'var(--red)' : 'var(--t1)' }}>{s.m.toFixed(4)}</td>
                        <td>{s.sigma.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>Recent forward price updates</h3>
              <div className="drill-table-wrap">
                <table className="drill-table">
                  <thead><tr><th>time</th><th>spot</th><th>forward</th><th>basis</th></tr></thead>
                  <tbody>
                    {d.priceHistory.slice(0, 8).map((p, i) => {
                      const basis = ((p.forward - p.spot) / p.spot) * 10000;
                      return (
                        <tr key={i}>
                          <td>{new Date(p.ts).toISOString().slice(11, 19)}</td>
                          <td>${p.spot.toFixed(2)}</td>
                          <td>${p.forward.toFixed(2)}</td>
                          <td style={{ color: basis < 0 ? 'var(--red)' : 'var(--green)' }}>{basis.toFixed(1)} bps</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p style={{ marginTop: 16, fontSize: 11, color: 'var(--t3)' }}>
                Direct chain query via <code>queryEvents</code> for this oracle's <code>OracleSVIUpdated</code> and <code>OraclePricesUpdated</code> streams. Cached 0s server-side.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
