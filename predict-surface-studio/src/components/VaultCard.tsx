import { useEffect, useState } from 'react';
import { fetchVault, Vault } from '../lib/predictApi';

export default function VaultCard() {
  const [v, setV] = useState<Vault | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => { const r = await fetchVault(); if (!cancelled) setV(r); };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!v) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;

  const utilization = v.plp_supply > 0 ? (v.vault_balance_dusdc / v.plp_supply) : 1;

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="vault-hero">
        <div className="vh-left">
          <div className="vh-label">VAULT BALANCE</div>
          <div className="vh-value">${v.vault_balance_dusdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="vh-sub">dUSDC available to back binary mints</div>
        </div>
        <div className="vh-right">
          <div className="vh-label">PLP SHARES OUTSTANDING</div>
          <div className="vh-value">{v.plp_supply.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="vh-sub">backing-per-share {utilization.toFixed(4)}</div>
        </div>
      </div>

      <div className="bot-health-grid">
        <div className="bh-row">
          <span className="bh-label">trading</span>
          <span className={'bh-pill ' + (v.trading_paused ? 'bad' : 'good')}>{v.trading_paused ? 'PAUSED' : 'ACTIVE'}</span>
        </div>
        <div className="bh-row">
          <span className="bh-label">withdrawal limiter</span>
          <span className={'bh-pill ' + (v.withdrawal_limiter.enabled ? 'warn' : 'good')}>
            {v.withdrawal_limiter.enabled ? `${v.withdrawal_limiter.available.toFixed(0)}/${v.withdrawal_limiter.capacity.toFixed(0)}` : 'unlimited'}
          </span>
        </div>
        <div className="bh-divider" />
        <div className="bh-row"><span className="bh-label">base spread</span><span className="bh-val">{v.base_spread_bps.toFixed(0)} bps</span></div>
        <div className="bh-row"><span className="bh-label">ask price range</span><span className="bh-val">${v.min_ask_price.toFixed(2)} - ${v.max_ask_price.toFixed(2)}</span></div>
        <div className="bh-row"><span className="bh-label">max total exposure</span><span className="bh-val">{v.max_total_exposure_pct.toFixed(0)}% of vault</span></div>
        <div className="bh-row"><span className="bh-label">accepted quotes</span><span className="bh-val">{v.accepted_quotes.length} type(s)</span></div>
      </div>
    </div>
  );
}
