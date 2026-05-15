import { useEffect, useState } from 'react';
import { fetchOpportunities, ArbOpportunity } from '../lib/predictApi';

export default function OpportunitiesFeed() {
  const [opps, setOpps] = useState<ArbOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchOpportunities();
      if (!cancelled) { setOpps(r); setLoading(false); }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;
  if (!opps.length) {
    return (
      <div className="empty">
        No opportunities above edge threshold right now.<br />
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>The bot only fires when |Predict IV − Poly IV| exceeds the configured edge.</span>
      </div>
    );
  }

  return (
    <div className="opps">
      {opps.map((o, i) => (
        <div className="opp-row" key={i}>
          <div className="opp-time">{new Date(o.ts).toISOString().slice(11, 19)}</div>
          <div className={'opp-side ' + (o.side === 'buyPredict' ? 'buy' : 'sell')}>
            {o.side === 'buyPredict' ? 'BUY Predict' : 'SELL Predict'}
          </div>
          <div className="opp-ivs">
            <span><strong className="mono">{(o.predictIv * 100).toFixed(2)}%</strong> predict</span>
            <span style={{ color: 'var(--t3)', margin: '0 6px' }}>vs</span>
            <span><strong className="mono">{(o.polyIv * 100).toFixed(2)}%</strong> poly</span>
          </div>
          <div className="opp-edge">edge <strong>{(o.edge * 100).toFixed(2)}%</strong></div>
          <div className="opp-kelly">kelly <strong>{(o.kelly * 100).toFixed(1)}%</strong></div>
        </div>
      ))}
    </div>
  );
}
