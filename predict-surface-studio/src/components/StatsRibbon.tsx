import { useEffect, useState } from 'react';
import { fetchStats, Stats } from '../lib/predictApi';

export default function StatsRibbon() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchStats();
      if (!cancelled) setS(r);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!s) {
    return (
      <div className="stats-ribbon">
        {Array.from({ length: 4 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 64 }} />)}
      </div>
    );
  }

  return (
    <div className="stats-ribbon">
      <div className="stat-card">
        <div className="label">24h positions</div>
        <div className="value">{s.mints}</div>
        <div className="sub">${s.mint_volume_dusdc.toFixed(0)} dUSDC notional</div>
      </div>
      <div className="stat-card">
        <div className="label">24h redeemed</div>
        <div className="value">{s.redeems}</div>
        <div className="sub">${s.payout_volume_dusdc.toFixed(0)} dUSDC paid out</div>
      </div>
      <div className="stat-card">
        <div className="label">24h PLP supply</div>
        <div className="value">${s.supplied_volume_dusdc.toFixed(0)}</div>
        <div className="sub">{s.supplied} deposits</div>
      </div>
      <div className="stat-card">
        <div className="label">Biggest payout 24h</div>
        <div className="value">${s.biggest_payout ? s.biggest_payout.payout_dusdc.toFixed(2) : '0'}</div>
        <div className="sub">{s.biggest_payout ? `${s.biggest_payout.side} k=${s.biggest_payout.strike.toFixed(0)}` : 'no redeems yet'}</div>
      </div>
    </div>
  );
}
