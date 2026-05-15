import { useEffect, useState } from 'react';
import SurfaceViewer from './components/SurfaceViewer';
import OracleList from './components/OracleList';
import SviParamsCard from './components/SviParamsCard';
import ArbStatus from './components/ArbStatus';
import SmilePlot from './components/SmilePlot';
import MultiSmilePlot from './components/MultiSmilePlot';
import TermStructurePlot from './components/TermStructurePlot';
import ActivityFeed from './components/ActivityFeed';
import MarketsTable from './components/MarketsTable';
import { TabsTop, TabsBottom, TabKey } from './components/TabNav';
import { fetchSurface, snapshotsFromSurface, SviSnapshot, SurfaceResponse } from './lib/predictApi';
import { iv as sviIv } from './lib/sviMath';

export default function App() {
  const [oracles, setOracles] = useState<SviSnapshot[]>([]);
  const [surface, setSurface] = useState<SurfaceResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(() => {
    const h = (typeof location !== 'undefined' && location.hash.slice(1)) || 'surface';
    return (['surface', 'smile', 'term', 'activity', 'markets'].includes(h) ? h : 'surface') as TabKey;
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const s = await fetchSurface();
      if (cancelled) return;
      if (!s) { setError('Could not reach predict-api'); return; }
      const snaps = snapshotsFromSurface(s);
      setSurface(s);
      setOracles(snaps);
      setIdx((cur) => Math.min(cur, Math.max(0, snaps.length - 1)));
      setError(null);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (typeof location !== 'undefined') location.hash = tab;
  }, [tab]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const card = t.closest('.card.glow') as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--x', `${e.clientX - r.left}px`);
      card.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, []);

  const current = oracles[idx];

  return (
    <div className="app">

      <header className="app-header">
        <div className="brand">
          <h1>Predict Surface Studio</h1>
          <span className="sub">DeepBook Predict · Sui testnet</span>
        </div>
        <div className="header-stats-desktop">
          {error ? (
            <span style={{ color: 'var(--bad)' }}>{error}</span>
          ) : surface ? (
            <>
              <span className="live-badge"><span className="live-dot" /> live</span>
              <span>BTC fwd <strong className="mono">${surface.primary.forward.toFixed(2)}</strong></span>
              <span><strong>{oracles.length}</strong> oracles</span>
              <span className={'source-pill ' + surface.source}>{surface.source}</span>
            </>
          ) : (
            <span className="live-badge"><span className="live-dot" /> connecting...</span>
          )}
        </div>
      </header>

      {/* mobile stat strip */}
      <div className="stats-strip">
        {error ? <span className="pill" style={{ color: 'var(--bad)' }}>{error}</span> : (
          <>
            <span className="pill"><span className="live-dot" /> Live</span>
            {surface && <span className="pill">BTC <strong>${surface.primary.forward.toFixed(0)}</strong></span>}
            {surface && <span className="pill"><strong>{oracles.length}</strong> oracles</span>}
            {surface && <span className={'pill source-pill ' + surface.source}>{surface.source}</span>}
            {current && (() => {
              const T = current.expirySec ? Math.max(current.expirySec - Date.now() / 1000, 60) / (365 * 86400) : 1/12;
              return <span className="pill">ATM <strong>{(sviIv(current.svi, 0, T) * 100).toFixed(1)}%</strong></span>;
            })()}
          </>
        )}
      </div>

      <TabsTop active={tab} onChange={setTab} />

      <main className="app-main">
        <TabPanel tab={tab} oracles={oracles} surface={surface} current={current} idx={idx} setIdx={setIdx} />
      </main>

      <TabsBottom active={tab} onChange={setTab} />
    </div>
  );
}

function TabPanel({ tab, oracles, surface, current, idx, setIdx }: any) {
  if (tab === 'surface') {
    return (
      <div className="tab-panel layout-surface">
        <section className="card glow panel-3d">
          {current ? <SurfaceViewer snapshot={current} /> : <div className="skeleton" style={{ width: '100%', height: '100%' }} />}
        </section>
        <aside className="panel-side">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Live BTC oracles</span>
              <span className="card-meta">{oracles.length} active</span>
            </div>
            {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : (
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 44 }} />)}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">SVI parameters</span><span className="card-meta">Gatheral raw</span></div>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              {current ? <SviParamsCard svi={current.svi} /> : <span className="skeleton" style={{ height: 140 }} />}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Arbitrage checks</span></div>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              {current ? <ArbStatus snapshot={current} allOracles={oracles} /> : <span className="skeleton" style={{ height: 60 }} />}
            </div>
          </div>
        </aside>
        <section className="card glow panel-smile" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><span className="card-title">Volatility smile (selected)</span><span className="card-meta">IV vs log-moneyness</span></div>
          <div style={{ flex: 1, position: 'relative', minHeight: 200 }}>
            {current ? <SmilePlot snapshot={current} /> : <div className="skeleton" style={{ position: 'absolute', inset: 12 }} />}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'smile') {
    return (
      <div className="tab-panel layout-2col">
        <section className="card glow" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><span className="card-title">Smile overlay (all oracles)</span><span className="card-meta">selected highlighted</span></div>
          <div style={{ flex: 1, minHeight: 320 }}>
            {oracles.length ? <MultiSmilePlot oracles={oracles} selectedIdx={idx} /> : <div className="skeleton" style={{ height: '100%' }} />}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><span className="card-title">Pick oracle</span><span className="card-meta">bold = selected</span></div>
          {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : <span className="skeleton" style={{ height: 240, margin: 16 }} />}
        </section>
      </div>
    );
  }

  if (tab === 'term') {
    return (
      <div className="tab-panel layout-full">
        <section className="card glow" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">ATM term structure + 25Δ wings</span>
            <span className="card-meta">IV vs days-to-expiry across all live oracles</span>
          </div>
          <div style={{ flex: 1, minHeight: 320 }}>
            {oracles.length ? <TermStructurePlot oracles={oracles} /> : <div className="skeleton" style={{ height: '100%' }} />}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className="tab-panel layout-full">
        <section className="card">
          <div className="card-head">
            <span className="card-title">On-chain activity</span>
            <span className="card-meta">recent Predict events</span>
          </div>
          <ActivityFeed />
        </section>
      </div>
    );
  }

  if (tab === 'markets') {
    return (
      <div className="tab-panel layout-full">
        <section className="card">
          <div className="card-head"><span className="card-title">Markets</span><span className="card-meta">click row to select</span></div>
          {oracles.length ? <MarketsTable oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : <span className="skeleton" style={{ height: 240, margin: 16 }} />}
        </section>
      </div>
    );
  }

  return null;
}
