import { useEffect, useState } from 'react';
import { fetchHourActivity, HourActivity } from '../lib/predictApi';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HourActivityHeatmap() {
  const [d, setD] = useState<HourActivity | null>(null);
  useEffect(() => { fetchHourActivity().then(setD); }, []);
  if (!d) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;
  const max = Math.max(1, ...d.cells.map((c) => c.vol));
  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="hour-heatmap">
        <div className="hh-cols">
          <div className="hh-corner" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="hh-h-label">{h % 6 === 0 ? `${h}:00` : ''}</div>
          ))}
        </div>
        {[0,1,2,3,4,5,6].map((dow) => (
          <div key={dow} className="hh-row">
            <div className="hh-d-label">{DOW[dow]}</div>
            {Array.from({ length: 24 }).map((_, h) => {
              const c = d.cells.find((x) => x.dow === dow && x.hour === h);
              const t = c ? c.vol / max : 0;
              return <div key={h} className="hh-cell" style={{ background: `rgba(41, 141, 255, ${0.08 + t * 0.85})` }} title={`${DOW[dow]} ${h}:00 - ${c?.mints ?? 0} mints, $${(c?.vol ?? 0).toFixed(0)}`} />;
            })}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        7-day mint volume by day-of-week × hour-of-day (UTC). Brighter = more dUSDC notional minted.
      </div>
    </div>
  );
}
