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
import OpportunitiesFeed from './components/OpportunitiesFeed';
import BotHealthCard from './components/BotHealthCard';
import TGBotCard from './components/TGBotCard';
import VaultCard from './components/VaultCard';
import Heatmap2D from './components/Heatmap2D';
import OracleDrilldown from './components/OracleDrilldown';
import LeaderboardCard from './components/LeaderboardCard';
import StrikeGrid from './components/StrikeGrid';
import BacktestChart from './components/BacktestChart';
import CalculatorSheet from './components/CalculatorSheet';
import AboutModal from './components/AboutModal';
import Toasts from './components/Toasts';
import HeroSection from './components/HeroSection';
import { TabsRow, TabKey, TABS } from './components/TabNav';
import { fetchSurface, snapshotsFromSurface, fetchStats, SviSnapshot, SurfaceResponse, Stats } from './lib/predictApi';

export default function App() {
  const [oracles, setOracles] = useState<SviSnapshot[]>([]);
  const [surface, setSurface] = useState<SurfaceResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(() => {
    const h = (typeof location !== 'undefined' && location.hash.slice(1)) || 'surface';
    return (TABS.some((t) => t.key === h) ? h : 'surface') as TabKey;
  });
  const [calcOpen, setCalcOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [drillOracle, setDrillOracle] = useState<string | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<'3d' | '2d'>('3d');

  useEffect(() => {
    let cancelled = false;
    const tickSurface = async () => {
      const s = await fetchSurface();
      if (cancelled) return;
      if (!s) { setError('Could not reach predict-api'); return; }
      const snaps = snapshotsFromSurface(s);
      setSurface(s);
      setOracles(snaps);
      setIdx((cur) => Math.min(cur, Math.max(0, snaps.length - 1)));
      setError(null);
    };
    const tickStats = async () => {
      const s = await fetchStats();
      if (!cancelled && s) setStats(s);
    };
    tickSurface(); tickStats();
    const ids = [setInterval(tickSurface, 15000), setInterval(tickStats, 60000)];
    return () => { cancelled = true; ids.forEach(clearInterval); };
  }, []);

  useEffect(() => { if (typeof location !== 'undefined') location.hash = tab; }, [tab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { setCalcOpen(false); setAboutOpen(false); return; }
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
    <div className="app page-in">
      <nav className="nav">
        <a className="brand" href="/">
          <div className="mark">σ</div>
          <div>
            <div className="brand-name">Predict Quant Suite</div>
          </div>
        </a>
        <div className="nav-actions">
          <button className="btn btn-ghost" onClick={() => setAboutOpen(true)} title="About (?)">About</button>
          <button className="btn btn-primary" onClick={() => setCalcOpen(true)} title="Calculator (C)">Open Calc →</button>
        </div>
      </nav>

      <HeroSection surface={surface} oracles={oracles} current={current} stats={stats} />

      <div className="tabs-wrap">
        <TabsRow active={tab} onChange={setTab} />
      </div>

      <main className="main">
        <TabPanel
          tab={tab}
          oracles={oracles}
          current={current}
          idx={idx}
          setIdx={setIdx}
          error={error}
          onDrillOracle={setDrillOracle}
          surfaceMode={surfaceMode}
          setSurfaceMode={setSurfaceMode}
        />
      </main>

      <footer className="foot">
        <div>Predict Quant Suite · open source on <a href="https://github.com/codedforum/predict-quant-suite" target="_blank" rel="noreferrer">github</a> · built on <a href="https://docs.sui.io/onchain-finance/deepbook-predict/" target="_blank" rel="noreferrer">DeepBook Predict</a></div>
      </footer>

      {calcOpen && oracles.length > 0 && (
        <CalculatorSheet oracles={oracles} selectedIdx={idx} onSelect={setIdx} onClose={() => setCalcOpen(false)} />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {drillOracle && <OracleDrilldown oracleId={drillOracle} onClose={() => setDrillOracle(null)} />}
      <Toasts />
    </div>
  );
}

function TabPanel({ tab, oracles, current, idx, setIdx, error, onDrillOracle, surfaceMode, setSurfaceMode }: any) {
  const skel = <div className="skeleton" style={{ height: 380 }} />;

  if (error && !oracles.length) {
    return <div className="empty">{error}. The bot may be restarting.</div>;
  }

  if (tab === 'surface') {
    return (
      <div className="tab-panel two-col">
        <section className="card glow tall" style={{ minHeight: 540 }}>
          <div className="card-head">
            <h2>Volatility Surface</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="mode-toggle">
                <button className={surfaceMode === '3d' ? 'active' : ''} onClick={() => setSurfaceMode('3d')}>3D</button>
                <button className={surfaceMode === '2d' ? 'active' : ''} onClick={() => setSurfaceMode('2d')}>2D heatmap</button>
              </div>
              <span className="meta oracle-id-link" onClick={() => current && onDrillOracle(current.oracleId)}>
                {current ? current.oracleId.slice(0, 12) + '...' + current.oracleId.slice(-4) : 'loading'}
              </span>
            </div>
          </div>
          <div className="card-body card-body-flex" style={{ padding: 0, minHeight: 480 }}>
            {current ? (surfaceMode === '3d' ? <SurfaceViewer snapshot={current} /> : <Heatmap2D snapshot={current} />) : skel}
          </div>
        </section>
        <aside className="side">
          <div className="card">
            <div className="card-head"><h2>Oracles</h2><span className="meta">{oracles.length} live</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>{Array.from({ length: 5 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 44 }} />)}</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>SVI Params</h2><span className="meta">Gatheral</span></div>
            <div className="card-body">
              {current ? <SviParamsCard svi={current.svi} /> : <span className="skeleton" style={{ height: 110 }} />}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Arb Status</h2></div>
            <div className="card-body">
              {current ? <ArbStatus snapshot={current} allOracles={oracles} /> : <span className="skeleton" style={{ height: 60 }} />}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  if (tab === 'smile') {
    return (
      <div className="tab-panel two-col">
        <section className="card glow tall" style={{ minHeight: 480 }}>
          <div className="card-head"><h2>Smile Overlay</h2><span className="meta">all live oracles</span></div>
          <div className="card-body card-body-flex" style={{ minHeight: 420 }}>
            {oracles.length ? <MultiSmilePlot oracles={oracles} selectedIdx={idx} /> : skel}
          </div>
        </section>
        <aside className="side">
          <div className="card">
            <div className="card-head"><h2>Pick Oracle</h2></div>
            <div className="card-body" style={{ padding: 0 }}>
              {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Selected Smile</h2><span className="meta">IV vs k</span></div>
            <div className="card-body" style={{ minHeight: 200, padding: 0 }}>
              {current ? <SmilePlot snapshot={current} /> : skel}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  if (tab === 'term') {
    return (
      <div className="tab-panel">
        <section className="card glow tall" style={{ minHeight: 520 }}>
          <div className="card-head"><h2>Term Structure</h2><span className="meta">ATM · 25Δ call · 25Δ put across days</span></div>
          <div className="card-body card-body-flex" style={{ minHeight: 460 }}>
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
          <div className="card-head"><h2>24h on-chain stats</h2><span className="meta">aggregated from settled events</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <StatsRibbon />
          </div>
        </section>
        <section className="card glow" style={{ minHeight: 380 }}>
          <div className="card-head"><h2>Vol-arb spread</h2><span className="meta">Predict IV vs Polymarket BTC binary</span></div>
          <div className="card-body card-body-flex" style={{ minHeight: 320 }}>
            <VolArbPlot />
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Strategy backtest</h2><span className="meta">simulate signals on the spread history</span></div>
          <BacktestChart />
        </section>
        <div className="two-col">
          <section className="card">
            <div className="card-head"><h2>Live opportunities</h2><span className="meta">edge above threshold</span></div>
            <div className="card-body card-body-flex" style={{ padding: 0, minHeight: 220 }}>
              <OpportunitiesFeed />
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Bot health</h2><span className="meta">runtime config</span></div>
            <BotHealthCard />
          </section>
        </div>
        <section className="card">
          <div className="card-head"><h2>On-chain vault</h2><span className="meta">live Predict object state</span></div>
          <VaultCard />
        </section>
        <section className="card">
          <div className="card-head"><h2>Trade from Telegram</h2><span className="meta">predict-tg-bot</span></div>
          <TGBotCard />
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className="tab-panel two-col">
        <section className="card tall" style={{ minHeight: 480 }}>
          <div className="card-head"><h2>On-chain activity</h2><span className="meta">recent Predict events</span></div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            <ActivityFeed />
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>24h Leaderboard</h2><span className="meta">top managers by payout</span></div>
          <LeaderboardCard />
        </section>
      </div>
    );
  }

  if (tab === 'markets') {
    return (
      <div className="tab-panel">
        <section className="card tall">
          <div className="card-head"><h2>Markets</h2><span className="meta">click row to select</span></div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            {oracles.length ? <MarketsTable oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
          </div>
        </section>
        <section className="card tall" style={{ minHeight: 360 }}>
          <div className="card-head">
            <h2>Strike chain (selected oracle)</h2>
            <span className="meta">{current ? current.oracleId.slice(0, 14) + '...' : '-'}</span>
          </div>
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            {current ? <StrikeGrid snapshot={current} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  return null;
}
