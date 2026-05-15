import { useEffect, useState } from 'react';
import { fetchActivity, ActivityEvent } from '../lib/predictApi';

const TYPE_COLOR: Record<string, string> = {
  PositionMinted:    'mint',
  PositionRedeemed:  'redeem',
  RangeMinted:       'mint',
  RangeRedeemed:     'redeem',
  OracleSVIUpdated:  'svi',
  OraclePricesUpdated: 'svi',
  OracleSettled:     'settle',
  Supplied:          'mint',
  Withdrawn:         'redeem',
};

export default function LiveTicker() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchActivity();
      if (!cancelled) setEvents(r.slice(0, 20));
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!events.length) return null;
  const stream = [...events, ...events];

  return (
    <div className="ticker-wrap">
      <span className="ticker-pin">LIVE FLOW</span>
      <div className="ticker-track">
        {stream.map((ev, i) => {
          const cls = TYPE_COLOR[ev.kind] ?? 'svi';
          const time = new Date(ev.timestampMs).toISOString().slice(11, 19);
          return (
            <span key={i} className="ticker-item">
              <span className={'ticker-dot ' + cls} />
              <span className="ticker-time">{time}</span>
              <span className={'ticker-kind ' + cls}>{ev.kind.replace(/^(Position|Oracle|Range)/, '').toLowerCase() || ev.kind}</span>
              <span className="ticker-body">{ev.summary}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
