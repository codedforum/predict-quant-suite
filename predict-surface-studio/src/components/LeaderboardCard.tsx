import { useEffect, useState } from 'react';
import { fetchLeaderboard, LeaderboardRow } from '../lib/predictApi';
import { downloadCsv } from '../lib/csv';

export default function LeaderboardCard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchLeaderboard();
      if (!cancelled) { setRows(r); setLoading(false); }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;
  if (!rows.length) return <div className="empty">No redeemed positions in the last 24h.</div>;

  const top = rows[0];

  function exportCsv() {
    downloadCsv('predict-leaderboard-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv',
      rows.map((r, i) => ({ rank: i + 1, manager: r.manager, payout: r.payout.toFixed(2), wins: r.wins, mints: r.mints, cost: r.cost.toFixed(2), net: r.net.toFixed(2) })));
  }

  return (
    <div className="card-body" style={{ padding: 0 }}>
      <div className="activity-toolbar"><span>{rows.length} traders</span><button className="icon-btn" onClick={exportCsv}>⬇ csv</button></div>
      <div className="lb-hero">
        <div className="lb-hero-rank">#1</div>
        <div className="lb-hero-body">
          <div className="lb-hero-mgr">{top.manager.slice(0, 14)}...{top.manager.slice(-6)}</div>
          <div className="lb-hero-stats">
            <span><strong className="num">${top.payout.toFixed(2)}</strong> payout</span>
            <span><strong className="num">{top.wins}</strong> wins</span>
            <span style={{ color: top.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
              <strong className="num">{top.net >= 0 ? '+' : ''}${top.net.toFixed(2)}</strong> net
            </span>
          </div>
        </div>
      </div>
      <table className="lb-table">
        <thead><tr><th>#</th><th>manager</th><th>payout</th><th>wins</th><th>mints</th><th>net</th></tr></thead>
        <tbody>
          {rows.slice(1).map((r, i) => (
            <tr key={r.manager}>
              <td>{i + 2}</td>
              <td>{r.manager.slice(0, 12)}...{r.manager.slice(-4)}</td>
              <td>${r.payout.toFixed(2)}</td>
              <td>{r.wins}</td>
              <td>{r.mints}</td>
              <td style={{ color: r.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.net >= 0 ? '+' : ''}${r.net.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
