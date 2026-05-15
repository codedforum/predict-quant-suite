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
import VolArbPlot from './components/VolArbPlot';
import StatsRibbon from './components/StatsRibbon';
import CalculatorSheet from './components/CalculatorSheet';
import AboutModal from './components/AboutModal';
import Toasts from './components/Toasts';
import LeftRail from './components/LeftRail';
import StatusBar from './components/StatusBar';
import { TabsRow, BottomNav, TabKey, TABS } from './components/TabNav';
import { fetchSurface, snapshotsFromSurface, SviSnapshot, SurfaceResponse } from './lib/predictApi';

export default function App() {
  const [oracles, setOracles] = useState<SviSnapshot[]>([]);
  const [surface, setSurface] = useState<SurfaceResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(() => {
    const h = (typeof location !== 'undefined' && location.hash.slice(1)) || 'surface';
    return (TABS.some((t) => t.key === h) ? h : 'surface') as TabKey;
  });
  const [calcOpen, setCalcOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    setDrawerOpen(false);
  }, [tab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { setCalcOpen(false); setAboutOpen(false); setDrawerOpen(false); return; }
      if (e.key === 'c' || e.key === 'C') { setCalcOpen((v) => !v); return; }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) { setAboutOpen((v) => !v); return; }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= TABS.length) setTab(TABS[num - 1].key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const current = oracles[idx];

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="mark">σ</div>
          <div>
            <h1>Predict Quant Suite</h1>
            <div className="sub">DeepBook Predict · Sui</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn menu-btn" onClick={() => setDrawerOpen(true)} title="Open oracles">≡</button>
          <button className="icon-btn primary" onClick={() => setCalcOpen(true)} title="Calculator (C)">Calc</button>
          <button className="icon-btn" onClick={() => setAboutOpen(true)} title="About (?)">?</button>
        </div>
      </header>

      <div className="stats-strip">
        {error ? <span className="pill" style={{ color: 'var(--bad)' }}>{error}</span> : (
          <>
            {surface && <span className="pill">BTC <strong>${surface.primary.forward.toFixed(0)}</strong></span>}
            {surface && <span className="pill"><strong>{oracles.length}</strong> oracles</span>}
            {surface && <span className={'pill source-pill ' + surface.source}>{surface.source}</span>}
          </>
        )}
      </div>

      <LeftRail oracles={oracles} selectedIdx={idx} onSelect={setIdx} current={current} />

      <TabsRow active={tab} onChange={setTab} />

      <main className="main">
        <TabPanel tab={tab} oracles={oracles} current={current} idx={idx} setIdx={setIdx} />
      </main>

      <BottomNav active={tab} onChange={setTab} />
      <StatusBar surface={surface} oracles={oracles} current={current} error={error} />

      {/* Mobile drawer = oracle context */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
          <div className="drawer">
            <div className="drawer-head">
              <h2>Oracles & params</h2>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <div className="rail-section">
              {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={(i) => { setIdx(i); setDrawerOpen(false); }} /> : <span className="skeleton" style={{ height: 200 }} />}
            </div>
            <div className="rail-section">
              <h3>SVI Params</h3>
              {current ? <SviParamsCard svi={current.svi} /> : null}
            </div>
            <div className="rail-section">
              <h3>Arb Status</h3>
              {current ? <ArbStatus snapshot={current} allOracles={oracles} /> : null}
            </div>
          </div>
        </>
      )}

      {calcOpen && oracles.length > 0 && (
        <CalculatorSheet oracles={oracles} selectedIdx={idx} onSelect={setIdx} onClose={() => setCalcOpen(false)} />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      <Toasts />
    </div>
  );
}

function TabPanel({ tab, oracles, current, idx, setIdx }: any) {
  const skel = <div className="skeleton" style={{ height: '100%', minHeight: 320 }} />;

  if (tab === 'surface') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head">
            <h2>Volatility Surface</h2>
            <span className="meta">{current ? current.oracleId.slice(0, 14) + '...' + current.oracleId.slice(-4) : '...'}</span>
          </div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            {current ? <SurfaceViewer snapshot={current} /> : skel}
          </div>
        </section>
        <section className="card" style={{ minHeight: 220 }}>
          <div className="card-head">
            <h2>Smile Cross-section</h2>
            <span className="meta">IV vs log-moneyness</span>
          </div>
          <div className="card-body card-body-flex" style={{ flex: 1, minHeight: 200, padding: 0 }}>
            {current ? <SmilePlot snapshot={current} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'smile') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head">
            <h2>Smile Overlay (all oracles)</h2>
            <span className="meta">selected highlighted</span>
          </div>
          <div className="card-body card-body-flex" style={{ minHeight: 380 }}>
            {oracles.length ? <MultiSmilePlot oracles={oracles} selectedIdx={idx} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'term') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head">
            <h2>Term Structure</h2>
            <span className="meta">ATM · 25Δ call · 25Δ put across days</span>
          </div>
          <div className="card-body card-body-flex" style={{ minHeight: 380 }}>
            {oracles.length ? <TermStructurePlot oracles={oracles} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'volarb') {
    return (
      <div className="tab-panel">
        <section className="card">
          <div className="card-head">
            <h2>24h Activity</h2>
            <span className="meta">aggregated from on-chain events</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <StatsRibbon />
          </div>
        </section>
        <section className="card tall">
          <div className="card-head">
            <h2>Vol-arb Spread</h2>
            <span className="meta">Predict IV vs Polymarket BTC binary</span>
          </div>
          <div className="card-body card-body-flex" style={{ minHeight: 320 }}>
            <VolArbPlot />
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head">
            <h2>On-chain Activity</h2>
            <span className="meta">recent Predict events</span>
          </div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            <ActivityFeed />
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'markets') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head">
            <h2>Markets</h2>
            <span className="meta">click row to select</span>
          </div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            {oracles.length ? <MarketsTable oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  return null;
}
