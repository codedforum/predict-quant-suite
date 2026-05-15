import { useEffect, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';

export default function SettlementCountdown({ oracles }: { oracles: SviSnapshot[] }) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  // Find oracles expiring in less than 1 hour
  const soon = oracles
    .filter((o) => o.expirySec && o.expirySec > now && (o.expirySec - now) < 3600)
    .sort((a, b) => a.expirySec - b.expirySec);
  if (!soon.length) return null;
  const next = soon[0];
  const secsLeft = Math.max(0, next.expirySec - now);
  const m = Math.floor(secsLeft / 60);
  const s = Math.floor(secsLeft % 60);
  const critical = secsLeft < 600;

  return (
    <div className={'settle-banner ' + (critical ? 'critical' : '')}>
      <span className="sb-pulse" />
      <span className="sb-label">SETTLEMENT IMMINENT</span>
      <span className="sb-text">
        Oracle <code>{next.oracleId.slice(0, 12)}...</code> settles in
        <strong className="sb-time"> {m}m {s.toString().padStart(2, '0')}s</strong>
      </span>
      {soon.length > 1 && <span className="sb-more">+{soon.length - 1} more soon</span>}
    </div>
  );
}
