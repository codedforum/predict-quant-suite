import { useEffect, useState, useMemo } from 'react';
import { fetchStrikeFlow, StrikeFlow, SviSnapshot } from '../lib/predictApi';

export default function StrikeFlowHeatmap({ oracle }: { oracle: SviSnapshot }) {
  const [d, setD] = useState<StrikeFlow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => { const r = await fetchStrikeFlow(oracle.oracleId); if (!cancelled) { setD(r); setLoading(false); } };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [oracle.oracleId]);

  const maxBars = useMemo(() => {
    if (!d) return { vol: 1, count: 1 };
    return {
      vol: Math.max(1, ...d.buckets.map((b) => b.callVol + b.putVol)),
      count: Math.max(1, ...d.buckets.map((b) => b.calls + b.puts)),
    };
  }, [d]);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 220 }} /></div>;
  if (!d || !d.buckets.length) return <div className="empty">No mints in last 24h for this oracle.</div>;

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="bot-health-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="bh-row"><span className="bh-label">strikes traded</span><span className="bh-val">{d.buckets.length}</span></div>
        <div className="bh-row"><span className="bh-label">total mints (24h)</span><span className="bh-val">{d.eventCount}</span></div>
      </div>
      <div className="flow-bars">
        {d.buckets.map((b) => {
          const cw = (b.callVol / maxBars.vol) * 50;
          const pw = (b.putVol  / maxBars.vol) * 50;
          return (
            <div className="flow-row" key={b.strike}>
              <div className="flow-side" style={{ justifyContent: 'flex-end' }}>
                <span className="flow-cnt">{b.calls > 0 ? `${b.calls} ` : ''}</span>
                <div className="flow-bar call" style={{ width: `${cw}%` }} />
              </div>
              <div className="flow-strike">${(b.strike / 1000).toFixed(0)}k</div>
              <div className="flow-side">
                <div className="flow-bar put" style={{ width: `${pw}%` }} />
                <span className="flow-cnt">{b.puts > 0 ? ` ${b.puts}` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        24h trade flow per ${'1k'} strike bucket. CALL volume left, PUT volume right. Each side scaled to the largest bucket.
      </div>
    </div>
  );
}
