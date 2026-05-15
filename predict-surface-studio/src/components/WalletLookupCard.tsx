import { useState } from 'react';
import { fetchPositions, PositionsLookup } from '../lib/predictApi';

export default function WalletLookupCard() {
  const [addr, setAddr] = useState('');
  const [data, setData] = useState<PositionsLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lookup() {
    if (!addr.startsWith('0x') || addr.length < 40) { setErr('Enter a valid Sui address (0x...)'); return; }
    setErr(null); setLoading(true); setData(null);
    const r = await fetchPositions(addr);
    setLoading(false);
    if (!r) { setErr('Could not look up positions'); return; }
    setData(r);
  }

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="0x... Sui address"
          value={addr}
          onChange={(e) => setAddr(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          style={{ flex: 1, background: 'var(--bg)', color: 'var(--t1)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
        />
        <button className="btn btn-primary" onClick={lookup} disabled={loading}>{loading ? '...' : 'Lookup'}</button>
      </div>

      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="bh-row">
            <span className="bh-label">predict managers</span>
            <span className="bh-pill good">{data.managerCount}</span>
          </div>
          {data.managers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>No PredictManagers found for this address.</div>
          ) : (
            data.managers.map((m, i) => (
              <div key={m.id} className="wallet-mgr">
                <div className="wm-head">
                  <span className="wm-rank">#{i + 1}</span>
                  <a href={`https://suiscan.xyz/testnet/object/${m.id}`} target="_blank" rel="noreferrer" className="mono">{m.id.slice(0, 18)}...{m.id.slice(-6)}</a>
                </div>
                <div className="wm-meta">
                  <span>created {new Date(m.createdMs).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
                  {m.balance_manager_id && (
                    <a href={`https://suiscan.xyz/testnet/object/${m.balance_manager_id}`} target="_blank" rel="noreferrer">balance manager ↗</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        Read-only lookup of PredictManager objects created by an address. No wallet connection required.
      </div>
    </div>
  );
}
