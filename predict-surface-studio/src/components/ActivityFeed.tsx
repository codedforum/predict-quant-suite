import { useEffect, useState } from 'react';
import { fetchActivity, ActivityEvent } from '../lib/predictApi';

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  PositionMinted:    { label: 'mint',   cls: 'mint' },
  PositionRedeemed:  { label: 'redeem', cls: 'redeem' },
  RangeMinted:       { label: 'range',  cls: 'mint' },
  RangeRedeemed:     { label: 'range-r', cls: 'redeem' },
  OracleSVIUpdated:  { label: 'svi',    cls: 'svi' },
  OraclePricesUpdated: { label: 'price',cls: 'svi' },
  OracleSettled:     { label: 'settle', cls: 'settle' },
  Supplied:          { label: 'supply', cls: 'mint' },
  Withdrawn:         { label: 'withdr', cls: 'redeem' },
};

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchActivity();
      if (cancelled) return;
      setEvents(r);
      setLoading(false);
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 8 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 32 }} />)}
      </div>
    );
  }

  if (!events.length) return <div className="empty">No on-chain events in the recent window.</div>;

  return (
    <div className="activity">
      {events.map((ev, i) => {
        const meta = TYPE_LABEL[ev.kind] ?? { label: ev.kind.toLowerCase(), cls: 'svi' };
        const time = new Date(ev.timestampMs).toISOString().slice(11, 19);
        return (
          <div className="activity-row" key={`${ev.txDigest}-${i}`}>
            <span className="ts">{time}</span>
            <span className={'ev ' + meta.cls}>{meta.label}</span>
            <span className="body">{ev.summary}</span>
            <a href={`https://suiscan.xyz/testnet/tx/${ev.txDigest}`} target="_blank" rel="noreferrer">tx ↗</a>
          </div>
        );
      })}
    </div>
  );
}
