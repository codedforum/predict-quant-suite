import { useEffect, useState } from 'react';
import SurfaceViewer from './components/SurfaceViewer';
import OracleList from './components/OracleList';
import SviParamsCard from './components/SviParamsCard';
import ArbStatus from './components/ArbStatus';
import SmilePlot from './components/SmilePlot';
import { fetchSurface, snapshotsFromSurface, SviSnapshot, SurfaceResponse } from './lib/predictApi';

export default function App() {
  const [oracles, setOracles] = useState<SviSnapshot[]>([]);
  const [surface, setSurface] = useState<SurfaceResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  // wire cursor-follow on .glow cards
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
        <div className="header-stats">
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

      <div className="app-body">

        <section className="card glow panel-surface" style={{ minHeight: 0 }}>
          {current ? (
            <SurfaceViewer snapshot={current} />
          ) : (
            <div className="skeleton" style={{ width: '100%', height: '100%' }} />
          )}
        </section>

        <aside className="panel-side">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Live BTC oracles</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{oracles.length} active</span>
            </div>
            {oracles.length ? (
              <OracleList oracles={oracles} selectedIdx={idx} onSelect={setIdx} />
            ) : (
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 44 }} />)}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">SVI parameters</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Gatheral raw</span>
            </div>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              {current ? <SviParamsCard svi={current.svi} /> : <span className="skeleton" style={{ height: 140 }} />}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Arbitrage checks</span>
            </div>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              {current ? <ArbStatus snapshot={current} allOracles={oracles} /> : <span className="skeleton" style={{ height: 60 }} />}
            </div>
          </div>
        </aside>

        <section className="card glow panel-smile" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">Volatility smile (selected oracle)</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>IV vs log-moneyness</span>
          </div>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {current ? <SmilePlot snapshot={current} /> : <div className="skeleton" style={{ position: 'absolute', inset: 12 }} />}
          </div>
        </section>

      </div>
    </div>
  );
}
