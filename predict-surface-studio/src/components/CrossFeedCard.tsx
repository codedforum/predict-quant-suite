import { useEffect, useMemo, useState } from 'react';
import { fetchCrossFeed, CrossFeedResponse } from '../lib/predictApi';

const SRC_COLORS: Record<string, string> = {
  deribit: '#10d188',
  polymarket: '#FB7B1C',
  none: '#666',
};

function sourcePill(source: string) {
  const c = SRC_COLORS[source] ?? '#888';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        background: `${c}1a`,
        border: `1px solid ${c}66`,
        color: c,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c, boxShadow: `0 0 6px ${c}` }} />
      {source}
    </span>
  );
}

export default function CrossFeedCard() {
  const [data, setData] = useState<CrossFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await fetchCrossFeed();
      if (!cancelled) {
        setData(r);
        setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const spark = useMemo(() => {
    if (!data?.recent?.length) return '';
    const pts = data.recent.filter((r) => r.iv != null && Number.isFinite(r.iv));
    if (pts.length < 2) return '';
    const W = 240, H = 40;
    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts || (t0 + 1);
    const ivs = pts.map((p) => p.iv as number);
    const lo = Math.min(...ivs);
    const hi = Math.max(...ivs);
    const span = Math.max(hi - lo, 1e-6);
    const path = pts.map((p, i) => {
      const x = ((p.ts - t0) / (t1 - t0)) * W;
      const y = H - ((p.iv as number) - lo) / span * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    return path;
  }, [data]);

  if (loading) return <div className="card-body"><span className="skeleton" style={{ height: 200 }} /></div>;
  if (!data) return <div className="card-body" style={{ color: '#888' }}>cross-feed unavailable</div>;

  const { latest, recent, health24h } = data;
  const ivPct = Number.isFinite(latest.atmIv) ? (latest.atmIv * 100).toFixed(2) : '—';
  const driftDays = latest.expiryDriftDays;
  const spot = latest.spot;
  const total24 = health24h.reduce((s, h) => s + h.count, 0) || 1;

  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {sourcePill(latest.source)}
        <div style={{ color: '#aaa', fontSize: 12 }}>{latest.sourceLabel}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">ATM IV</span>
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-1px' }}>{ivPct}%</span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Spot</span>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
            {spot ? `$${spot.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
          </span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Expiry drift</span>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
            {driftDays != null ? `${driftDays.toFixed(2)}d` : '—'}
          </span>
        </div>
        <div className="bh-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="bh-label">Recent pulls</span>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{recent.length}</span>
        </div>
      </div>

      {spark && (
        <div>
          <div className="bh-label" style={{ marginBottom: 4 }}>IV (last {recent.length} pulls)</div>
          <svg viewBox="0 0 240 40" width="100%" height={40} preserveAspectRatio="none">
            <path d={spark} fill="none" stroke={SRC_COLORS[latest.source] ?? '#FB7B1C'} strokeWidth={1.5} />
          </svg>
        </div>
      )}

      {health24h.length > 0 && (
        <div>
          <div className="bh-label" style={{ marginBottom: 6 }}>24h source mix</div>
          <div style={{ display: 'flex', gap: 2, borderRadius: 6, overflow: 'hidden', height: 14, background: '#0a0a0a' }}>
            {health24h.map((h) => (
              <div
                key={h.source}
                style={{
                  width: `${(h.count / total24) * 100}%`,
                  background: SRC_COLORS[h.source] ?? '#888',
                  opacity: 0.85,
                }}
                title={`${h.source}: ${h.count} pulls (${(h.pct * 100).toFixed(1)}%)`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#aaa', flexWrap: 'wrap' }}>
            {health24h.map((h) => (
              <span key={h.source} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: SRC_COLORS[h.source] ?? '#888' }} />
                {h.source} {(h.pct * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {latest.instruments && latest.instruments.length > 0 && (
        <div>
          <div className="bh-label" style={{ marginBottom: 4 }}>ATM instruments averaged</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {latest.instruments.map((it) => (
              <code key={it.name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#0a0a0a', border: '1px solid #1a1a1a', color: '#ccc' }}>
                {it.name} · {(it.iv * 100).toFixed(2)}%
              </code>
            ))}
          </div>
        </div>
      )}

      {latest.errors && Object.keys(latest.errors).length > 0 && (
        <details style={{ fontSize: 11, color: '#888' }}>
          <summary style={{ cursor: 'pointer' }}>fallback reasons ({Object.keys(latest.errors).length})</summary>
          <pre style={{ margin: '6px 0 0', padding: 8, background: '#0a0a0a', borderRadius: 4, border: '1px solid #1a1a1a', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(latest.errors, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
