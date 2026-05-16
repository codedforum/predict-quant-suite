import { useEffect, useState } from 'react';
import { fetchHedge, HedgeResponse } from '../lib/predictApi';

function fmtBtc(v: number, sig = 5) {
  if (!Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(sig)} BTC`;
}
function fmtUsd(v: number) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function HedgeCard() {
  const [data, setData] = useState<HedgeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchHedge();
      if (!cancelled) {
        setData(r);
        setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 220 }} /></div>;
  if (!data || data.snapshot?.error) {
    return <div className="card-body" style={{ color: '#888', fontSize: 13 }}>
      hedge module {data?.snapshot?.error ? `error: ${data.snapshot.error}` : 'unavailable'}
    </div>;
  }

  const s = data.snapshot;
  const driftPct = Math.abs(s.drift) / Math.max(s.rebalanceThreshold, 1e-9);
  const driftColor = driftPct > 1 ? '#ef4444' : driftPct > 0.6 ? '#FB7B1C' : '#10d188';

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          padding: '3px 10px', borderRadius: 999,
          background: s.live ? '#ef44441a' : '#10d1881a',
          border: `1px solid ${s.live ? '#ef4444aa' : '#10d18866'}`,
          color: s.live ? '#ef4444' : '#10d188',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {s.live ? 'LIVE' : 'DRY-RUN'}
        </span>
        <span style={{ fontSize: 12, color: '#aaa' }}>Hyperliquid · BTC perp</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>spot {fmtUsd(s.spot)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Portfolio Δ</span>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{fmtBtc(s.portfolioDelta)}</span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">HL current</span>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{fmtBtc(s.hlCurrent)}</span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Hedge target</span>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{fmtBtc(s.hedgeTarget)}</span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Drift</span>
          <span style={{ color: driftColor, fontSize: 16, fontWeight: 700 }}>{fmtBtc(s.drift)}</span>
        </div>
      </div>

      <div>
        <div className="bh-label" style={{ marginBottom: 4 }}>
          Drift vs rebalance threshold ({s.rebalanceThreshold.toFixed(4)} BTC)
        </div>
        <div style={{ height: 8, background: '#0a0a0a', borderRadius: 999, overflow: 'hidden', border: '1px solid #1a1a1a' }}>
          <div style={{
            width: `${Math.min(100, driftPct * 100)}%`,
            height: '100%',
            background: driftColor,
            transition: 'width 0.4s, background 0.4s',
          }} />
        </div>
      </div>

      {s.action ? (
        <div style={{
          padding: 10, borderRadius: 8,
          background: '#FB7B1C12', border: '1px solid #FB7B1C44',
          fontSize: 13, color: '#FB7B1C',
        }}>
          <b>Next action:</b> {s.action.side} {s.action.sizeBtc.toFixed(5)} BTC @ ${s.action.atSpot.toFixed(0)}
          {' '}≈ {fmtUsd(s.action.notionalUsd)}
          {' '}<span style={{ color: '#aaa' }}>· {s.live ? 'will submit live' : 'logged, no order placed (DRY-RUN)'}</span>
        </div>
      ) : (
        <div style={{ padding: 10, borderRadius: 8, background: '#10d18812', border: '1px solid #10d18844', fontSize: 13, color: '#10d188' }}>
          drift below threshold · no rebalance needed
        </div>
      )}

      {s.breakdown && s.breakdown.length > 0 && (
        <div>
          <div className="bh-label" style={{ marginBottom: 6 }}>Delta breakdown ({s.breakdown.length} open)</div>
          <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #1a1a1a', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0d0d0d', color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>side</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>type</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>strike</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>size BTC</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>BSM Δ</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>contrib</th>
                </tr>
              </thead>
              <tbody>
                {s.breakdown.map((b, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #1a1a1a' }}>
                    <td style={{ padding: '5px 8px', color: b.side === 'long' ? '#10d188' : '#ef4444' }}>{b.side}</td>
                    <td style={{ padding: '5px 8px' }}>{b.kind}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${b.strike.toLocaleString()}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.sizeBtc.toFixed(5)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.bsmDelta.toFixed(3)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: b.contribBtc >= 0 ? '#10d188' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                      {b.contribBtc >= 0 ? '+' : ''}{b.contribBtc.toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.history && data.history.length > 0 && (
        <details style={{ fontSize: 12, color: '#aaa' }}>
          <summary style={{ cursor: 'pointer' }}>Recent hedge log ({data.history.length})</summary>
          <div style={{ marginTop: 6, maxHeight: 140, overflowY: 'auto', border: '1px solid #1a1a1a', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <tbody>
                {data.history.slice(-20).reverse().map((h) => (
                  <tr key={h.ts} style={{ borderTop: '1px solid #1a1a1a' }}>
                    <td style={{ padding: '4px 8px', color: '#888' }}>{new Date(h.ts).toLocaleTimeString()}</td>
                    <td style={{ padding: '4px 8px', color: h.actionSide === 'BUY' ? '#10d188' : '#ef4444' }}>{h.actionSide ?? '—'}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{h.actionSize?.toFixed(5) ?? '—'}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#aaa' }}>{fmtUsd(h.spot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
