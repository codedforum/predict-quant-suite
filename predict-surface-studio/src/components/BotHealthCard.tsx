import { useEffect, useState } from 'react';
import { fetchHealth, Health } from '../lib/predictApi';

export default function BotHealthCard() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => { const r = await fetchHealth(); if (!cancelled) setH(r); };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!h) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;

  const polyOk = h.polymarket_alive;
  const dryRun = h.dry_run;
  const killed = h.kill_switch_active;
  const fresh = h.last_poll_age_s !== null && h.last_poll_age_s < 60;

  return (
    <div className="card-body">
      <div className="bot-health-grid">
        <div className="bh-row">
          <span className="bh-label">mode</span>
          <span className={'bh-pill ' + (dryRun ? 'warn' : 'good')}>{dryRun ? 'paper · dry-run' : 'live trading'}</span>
        </div>
        <div className="bh-row">
          <span className="bh-label">kill switch</span>
          <span className={'bh-pill ' + (killed ? 'bad' : 'good')}>{killed ? 'engaged' : 'armed'}</span>
        </div>
        <div className="bh-row">
          <span className="bh-label">last poll</span>
          <span className={'bh-pill ' + (fresh ? 'good' : 'warn')}>
            {h.last_poll_age_s !== null ? `${h.last_poll_age_s}s ago` : 'never'}
          </span>
        </div>
        <div className="bh-row">
          <span className="bh-label">polymarket feed</span>
          <span className={'bh-pill ' + (polyOk ? 'good' : 'warn')}>{polyOk ? 'live' : 'cold'}</span>
        </div>

        <div className="bh-divider" />

        <div className="bh-row"><span className="bh-label">edge threshold</span><span className="bh-val">{(h.min_edge_vol * 100).toFixed(1)}%</span></div>
        <div className="bh-row"><span className="bh-label">bankroll</span><span className="bh-val">${h.bankroll_usdc.toLocaleString()}</span></div>
        <div className="bh-row"><span className="bh-label">max daily loss</span><span className="bh-val">${h.max_daily_loss_usdc.toLocaleString()}</span></div>
        <div className="bh-row"><span className="bh-label">poll interval</span><span className="bh-val">{(h.poll_ms / 1000).toFixed(0)}s</span></div>

        <div className="bh-divider" />

        <div className="bh-row"><span className="bh-label">predict pkg</span><span className="bh-val mono">{h.predict_pkg}</span></div>
        <div className="bh-row"><span className="bh-label">rpc</span><span className="bh-val mono" style={{ fontSize: 10 }}>{new URL(h.rpc).host}</span></div>
        <div className="bh-row"><span className="bh-label">build</span><span className="bh-val">{h.version}</span></div>
      </div>
    </div>
  );
}
