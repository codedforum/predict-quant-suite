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
import CrossFeedCard from './components/CrossFeedCard';
import HedgeCard from './components/HedgeCard';
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
import WalletLookupCard from './components/WalletLookupCard';
import CompareOraclesPanel from './components/CompareOraclesPanel';
import ScrollSpy from './components/ScrollSpy';
import LiveTicker from './components/LiveTicker';
import ProbabilityHistogram from './components/ProbabilityHistogram';
import VolatilityCone from './components/VolatilityCone';
import TourMode, { shouldShowTour } from './components/TourMode';
import SettlementCountdown from './components/SettlementCountdown';
import OrderBookCard from './components/OrderBookCard';
import StrikeFlowHeatmap from './components/StrikeFlowHeatmap';
import HourActivityHeatmap from './components/HourActivityHeatmap';
import SettingsModal from './components/SettingsModal';
import CalculatorSheet from './components/CalculatorSheet';
import AboutModal from './components/AboutModal';
import Toasts from './components/Toasts';
import HeroSection from './components/HeroSection';
import { TabsRow, TabKey, TABS } from './components/TabNav';
import { fetchSurface, snapshotsFromSurface, fetchStats, SviSnapshot, SurfaceResponse, Stats } from './lib/predictApi';
import { iv as sviIv } from './lib/sviMath';

// Live metric bar above the 3D surface — ATM IV, forward, expiry countdown, freshness.
function SurfaceStatBar({ snap }: { snap?: SviSnapshot }) {
  if (!snap) return <div className="surf-statbar"><div className="skeleton" style={{ height: 28, width: '100%' }} /></div>;
  const now = Date.now();
  const tYears = Math.max(1 / (365 * 24), (snap.expirySec * 1000 - now) / (365 * 24 * 3600 * 1000));
  const atm = sviIv(snap.svi, 0, tYears) * 100;
  const wingLo = sviIv(snap.svi, Math.log(0.88), tYears) * 100;
  const wingHi = sviIv(snap.svi, Math.log(1.12), tYears) * 100;
  const skew = wingLo - wingHi; // put-wing minus call-wing
  const secsLeft = Math.max(0, snap.expirySec - Math.floor(now / 1000));
  const d = Math.floor(secsLeft / 86400), h = Math.floor((secsLeft % 86400) / 3600), m = Math.floor((secsLeft % 3600) / 60);
  const expStr = secsLeft <= 0 ? 'settled' : d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const ageS = Math.max(0, Math.floor((now - (snap.timestampMs || now)) / 1000));
  const items = [
    { l: 'ATM IV', v: `${atm.toFixed(1)}%`, accent: true },
    { l: 'Forward', v: `$${(snap.forward / 1000).toFixed(1)}k` },
    { l: '25Δ skew', v: `${skew >= 0 ? '+' : ''}${skew.toFixed(1)}`, tone: skew >= 0 ? 'pos' : 'neg' },
    { l: 'Expiry', v: expStr },
    { l: 'Updated', v: ageS < 90 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago` },
  ];
  return (
    <div className="surf-statbar">
      {items.map((it, i) => (
        <div className="surf-stat" key={i}>
          <span className="ss-l">{it.l}</span>
          <span className={'ss-v' + (it.accent ? ' accent' : '') + (it.tone ? ' ' + it.tone : '')}>{it.v}</span>
        </div>
      ))}
      <div className="surf-stat src"><span className="ss-l">Source</span><span className="ss-v live"><i className="ss-dot" />on-chain SVI</span></div>
    </div>
  );
}

// ATM implied vol for any oracle snapshot, computed live from its SVI params.
function atmIvOf(s: SviSnapshot): number {
  const T = Math.max(1 / (365 * 24), (s.expirySec * 1000 - Date.now()) / (365 * 24 * 3600 * 1000));
  return sviIv(s.svi, 0, T);
}

// Generic live metric bar reused across tabs (shares .surf-statbar styling).
function MetricBar({ items }: { items: { l: string; v: string; accent?: boolean; tone?: string; live?: boolean }[] }) {
  return (
    <div className="surf-statbar">
      {items.map((it, i) => (
        <div className={'surf-stat' + (it.live ? ' src' : '')} key={i}>
          <span className="ss-l">{it.l}</span>
          <span className={'ss-v' + (it.accent ? ' accent' : '') + (it.tone ? ' ' + it.tone : '') + (it.live ? ' live' : '')}>
            {it.live ? <><i className="ss-dot" />{it.v}</> : it.v}
          </span>
        </div>
      ))}
    </div>
  );
}

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
  const [tourOpen, setTourOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (shouldShowTour()) setTimeout(() => setTourOpen(true), 1500);
  }, []);

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
          <button className="btn btn-ghost" onClick={() => setTourOpen(true)} title="Take tour">Tour</button>
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
          <button className="btn btn-ghost" onClick={() => setAboutOpen(true)} title="About (?)">About</button>
          <button className="btn btn-primary" onClick={() => setCalcOpen(true)} title="Calculator (C)">Open Calc →</button>
        </div>
      </nav>

      <LiveTicker />
      <SettlementCountdown oracles={oracles} />

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
      <TourMode open={tourOpen} onClose={() => setTourOpen(false)} onTabChange={(t) => setTab(t as TabKey)} />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
      <div className="tab-panel surface-page">
        <section className="card glow tall surface-hero" style={{ minHeight: 620 }}>
          <div className="card-head">
            <div className="ch-title">
              <h2>Volatility Surface</h2>
              <span className="hero-tag">Gatheral SVI · live on-chain</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="mode-toggle">
                <button className={surfaceMode === '3d' ? 'active' : ''} onClick={() => setSurfaceMode('3d')}>3D</button>
                <button className={surfaceMode === '2d' ? 'active' : ''} onClick={() => setSurfaceMode('2d')}>2D heatmap</button>
              </div>
              <span className="meta oracle-id-link" onClick={() => current && onDrillOracle(current.oracleId)} title="Open oracle drilldown">
                {current ? current.oracleId.slice(0, 10) + '…' + current.oracleId.slice(-4) : 'loading'}
              </span>
            </div>
          </div>
          <SurfaceStatBar snap={current} />
          <div className="card-body card-body-flex surface-stage" style={{ padding: 0, minHeight: 480 }}>
            {current ? (surfaceMode === '3d' ? <SurfaceViewer snapshot={current} /> : <Heatmap2D snapshot={current} />) : skel}
          </div>
        </section>

        <div className="two-col">
          <section className="card glow">
            <div className="card-head">
              <h2>Implied probability distribution</h2>
              <span className="meta">where BTC lands at expiry · ${((current?.forward || 79000) * 0.015 / 1000).toFixed(1)}k bins</span>
            </div>
            <div className="card-body">
              {current ? <ProbabilityHistogram snapshot={current} /> : skel}
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
      </div>
    );
  }

  if (tab === 'smile') {
    const ivs = (oracles as SviSnapshot[]).map(atmIvOf).filter(Number.isFinite).map((v: number) => v * 100);
    const ivLo = ivs.length ? Math.min(...ivs) : 0, ivHi = ivs.length ? Math.max(...ivs) : 0;
    return (
      <div className="tab-panel surface-page">
        <section className="card glow tall surface-hero" style={{ minHeight: 520 }}>
          <div className="card-head">
            <div className="ch-title"><h2>Smile Overlay</h2><span className="hero-tag">all live oracles · log-moneyness</span></div>
            <span className="meta">{oracles.length} oracles</span>
          </div>
          {oracles.length ? <MetricBar items={[
            { l: 'Live oracles', v: String(oracles.length), accent: true },
            { l: 'ATM IV range', v: `${ivLo.toFixed(1)}–${ivHi.toFixed(1)}%` },
            { l: 'Forward', v: current ? `$${(current.forward / 1000).toFixed(1)}k` : '—' },
            { l: 'Curves', v: 'live', live: true },
          ]} /> : null}
          <div className="card-body card-body-flex" style={{ minHeight: 400 }}>
            {oracles.length ? <MultiSmilePlot oracles={oracles} selectedIdx={idx} /> : skel}
          </div>
        </section>
        <div className="two-col">
          <section className="card glow">
            <div className="card-head"><div className="ch-title"><h2>Compare A vs B</h2></div><span className="meta">side-by-side params</span></div>
            {oracles.length ? <CompareOraclesPanel oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
          </section>
          <aside className="side">
            <section className="card">
              <div className="card-head"><h2>Pick oracle</h2><span className="meta">{oracles.length}</span></div>
              <div className="card-body" style={{ padding: 0 }}>
                {oracles.length ? <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  if (tab === 'term') {
    const days = (oracles as SviSnapshot[]).map((o) => Math.max(0, (o.expirySec * 1000 - Date.now()) / 86400000));
    const near = days.length ? Math.min(...days) : 0, far = days.length ? Math.max(...days) : 0;
    return (
      <div className="tab-panel surface-page">
        <section className="card glow tall surface-hero" style={{ minHeight: 500 }}>
          <div className="card-head">
            <div className="ch-title"><h2>Term Structure</h2><span className="hero-tag">ATM · 25Δ wings across days</span></div>
            <span className="meta">{oracles.length} expiries</span>
          </div>
          {oracles.length ? <MetricBar items={[
            { l: 'Expiries', v: String(oracles.length), accent: true },
            { l: 'Nearest', v: near < 1 ? `${(near * 24).toFixed(0)}h` : `${near.toFixed(1)}d` },
            { l: 'Furthest', v: `${far.toFixed(1)}d` },
            { l: 'ATM IV', v: current ? `${(atmIvOf(current) * 100).toFixed(1)}%` : '—' },
            { l: 'Surface', v: 'live', live: true },
          ]} /> : null}
          <div className="card-body card-body-flex" style={{ minHeight: 360 }}>
            {oracles.length ? <TermStructurePlot oracles={oracles} /> : skel}
          </div>
        </section>
        <section className="card glow">
          <div className="card-head">
            <div className="ch-title"><h2>Volatility cone</h2><span className="hero-tag">realized vs implied</span></div>
            <span className="meta">selected oracle · across windows</span>
          </div>
          <div className="card-body">
            {current ? <VolatilityCone oracle={current} /> : skel}
          </div>
        </section>
      </div>
    );
  }

  if (tab === 'volarb') {
    const sections = [
      { id: 'sec-stats', label: '24h stats' },
      { id: 'sec-crossfeed', label: 'Cross-feed' },
      { id: 'sec-spread', label: 'Spread' },
      { id: 'sec-hedge', label: 'Delta hedge' },
      { id: 'sec-backtest', label: 'Backtest' },
      { id: 'sec-opps', label: 'Opportunities' },
      { id: 'sec-vault', label: 'Vault' },
      { id: 'sec-wallet', label: 'Wallet lookup' },
      { id: 'sec-tg', label: 'Telegram' },
    ];
    return (
      <div className="tab-panel two-col" style={{ gridTemplateColumns: '1fr 200px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="card glow surface-hero">
            <div className="card-head">
              <div className="ch-title"><h2>Vol-Arb Engine</h2><span className="hero-tag">Predict IV vs cross-feed · keeper</span></div>
              <a className="meta oracle-id-link" href="https://predict-api.smartcodedbot.com" target="_blank" rel="noreferrer">live dashboard →</a>
            </div>
            <MetricBar items={[
              { l: 'Mode', v: 'DRY-RUN', accent: true },
              { l: 'Oracles', v: String(oracles.length) },
              { l: 'Strategy', v: 'IV spread' },
              { l: 'Hedge', v: 'Hyperliquid Δ' },
              { l: 'Keeper', v: 'polling', live: true },
            ]} />
          </section>
          <section id="sec-stats" className="card">
            <div className="card-head"><h2>24h on-chain stats</h2><span className="meta">aggregated from settled events</span></div>
            <div className="card-body" style={{ padding: 0 }}><StatsRibbon /></div>
          </section>
          <section id="sec-crossfeed" className="card">
            <div className="card-head"><h2>Cross-feed</h2><span className="meta">Deribit-primary IV pair, Polymarket fallback</span></div>
            <CrossFeedCard />
          </section>
          <section id="sec-spread" className="card glow" style={{ minHeight: 380 }}>
            <div className="card-head"><h2>Vol-arb spread</h2><span className="meta">Predict IV vs cross-feed IV</span></div>
            <div className="card-body card-body-flex" style={{ minHeight: 320 }}><VolArbPlot /></div>
          </section>
          <section id="sec-hedge" className="card glow">
            <div className="card-head"><h2>Delta hedge · Hyperliquid</h2><span className="meta">portfolio Δ offset on BTC perps</span></div>
            <HedgeCard />
          </section>
          <section id="sec-backtest" className="card">
            <div className="card-head"><h2>Strategy backtest</h2><span className="meta">simulate signals on the spread history</span></div>
            <BacktestChart />
          </section>
          <div id="sec-opps" className="two-col">
            <section className="card">
              <div className="card-head"><h2>Live opportunities</h2><span className="meta">edge above threshold</span></div>
              <div className="card-body card-body-flex" style={{ padding: 0, minHeight: 220 }}><OpportunitiesFeed /></div>
            </section>
            <section className="card">
              <div className="card-head"><h2>Bot health</h2><span className="meta">runtime config</span></div>
              <BotHealthCard />
            </section>
          </div>
          <section id="sec-vault" className="card">
            <div className="card-head"><h2>On-chain vault</h2><span className="meta">live Predict object state</span></div>
            <VaultCard />
          </section>
          <section id="sec-wallet" className="card">
            <div className="card-head"><h2>Wallet position lookup</h2><span className="meta">paste any Sui address</span></div>
            <WalletLookupCard />
          </section>
          <section id="sec-tg" className="card">
            <div className="card-head"><h2>Trade from Telegram</h2><span className="meta">predict-tg-bot</span></div>
            <TGBotCard />
          </section>
        </div>
        <ScrollSpy sections={sections} />
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className="tab-panel surface-page">
        <div className="two-col">
          <section className="card glow tall surface-hero" style={{ minHeight: 500 }}>
            <div className="card-head">
              <div className="ch-title"><h2>On-chain Activity</h2><span className="hero-tag">live Predict events</span></div>
              <span className="meta">mints · redeems · settles</span>
            </div>
            <div className="card-body card-body-flex" style={{ padding: 0 }}>
              <ActivityFeed />
            </div>
          </section>
          <aside className="side">
            <section className="card glow">
              <div className="card-head"><div className="ch-title"><h2>24h Leaderboard</h2></div><span className="meta">top managers</span></div>
              <LeaderboardCard />
            </section>
          </aside>
        </div>
        <section className="card glow">
          <div className="card-head"><div className="ch-title"><h2>Activity heatmap</h2><span className="hero-tag">7-day · by hour UTC</span></div><span className="meta">mint volume</span></div>
          <HourActivityHeatmap />
        </section>
      </div>
    );
  }

  if (tab === 'markets') {
    return (
      <div className="tab-panel surface-page">
        <section className="card glow tall surface-hero">
          <div className="card-head">
            <div className="ch-title"><h2>Markets</h2><span className="hero-tag">live on-chain orderbook</span></div>
            <span className="meta">{oracles.length} markets · click to select</span>
          </div>
          {oracles.length ? <MetricBar items={[
            { l: 'Markets', v: String(oracles.length), accent: true },
            { l: 'ATM IV', v: current ? `${(atmIvOf(current) * 100).toFixed(1)}%` : '—' },
            { l: 'Forward', v: current ? `$${(current.forward / 1000).toFixed(1)}k` : '—' },
            { l: 'Selected', v: current ? current.oracleId.slice(0, 8) + '…' : '—' },
            { l: 'Quotes', v: 'live', live: true },
          ]} /> : null}
          <div className="card-body card-body-flex" style={{ padding: 0 }}>
            {oracles.length ? <MarketsTable oracles={oracles} selectedIdx={idx} onSelect={setIdx} /> : skel}
          </div>
        </section>
        <div className="two-col">
          <section className="card glow">
            <div className="card-head"><div className="ch-title"><h2>Live order book</h2></div><span className="meta">on-chain via devInspect</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {current ? <OrderBookCard oracle={current} /> : skel}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><div className="ch-title"><h2>BSM strike chain</h2></div><span className="meta">approximated</span></div>
            <div className="card-body card-body-flex" style={{ padding: 0 }}>
              {current ? <StrikeGrid snapshot={current} /> : skel}
            </div>
          </section>
        </div>
        <section className="card glow">
          <div className="card-head"><div className="ch-title"><h2>24h trade flow per strike</h2><span className="hero-tag">volume distribution</span></div></div>
          {current ? <StrikeFlowHeatmap oracle={current} /> : skel}
        </section>
      </div>
    );
  }

  return null;
}
