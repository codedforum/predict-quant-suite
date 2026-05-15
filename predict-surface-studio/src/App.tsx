import { useEffect, useState } from 'react';
import SurfaceViewer from './components/SurfaceViewer';
import { fetchSurface, snapshotsFromSurface, SviSnapshot, SurfaceResponse } from './lib/predictApi';
import { checkArbFree } from './lib/sviMath';

export default function App() {
  const [snapshots, setSnapshots] = useState<SviSnapshot[]>([]);
  const [surface, setSurface] = useState<SurfaceResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const s = await fetchSurface();
      if (cancelled) return;
      if (!s) {
        setError('Could not reach predict-api. Bot may be restarting.');
        return;
      }
      const snaps = snapshotsFromSurface(s);
      setSurface(s);
      setSnapshots(snaps);
      setIdx(snaps.length - 1);
      setError(null);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const current = snapshots[idx];
  const arb = current ? checkArbFree(current) : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: '64px 1fr 88px' }}>
      <header style={{ display: 'flex', alignItems: 'center', padding: '0 22px', borderBottom: '1px solid #1b2030', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <strong style={{ fontSize: 16 }}>Predict Surface Studio</strong>
          <span style={{ opacity: 0.55, fontSize: 12 }}>DeepBook Predict · Sui testnet</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, display: 'flex', gap: 18, alignItems: 'center' }}>
          {surface ? (
            <>
              <span>BTC fwd: <strong>${surface.primary.forward.toFixed(2)}</strong></span>
              <span>{snapshots.length} oracles</span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: surface.source === 'chain' ? '#1f3d2a' : '#2a2f3d', color: surface.source === 'chain' ? '#5fd49a' : '#5b9dff' }}>
                {surface.source}
              </span>
            </>
          ) : error ? (
            <span style={{ color: '#ff7a85' }}>{error}</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#5b9dff', animation: 'pulse 1s infinite' }} />
              Loading SVI surface from testnet...
            </span>
          )}
        </div>
      </header>

      <main style={{ position: 'relative' }}>
        {current ? (
          <SurfaceViewer snapshot={current} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40 }}>
            <div style={{ maxWidth: 480 }}>
              <div style={{ fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 14 }}>Live volatility surface</div>
              {error ? (
                <p style={{ color: '#ff7a85' }}>{error}</p>
              ) : (
                <p style={{ opacity: 0.7, lineHeight: 1.6 }}>
                  Pulling Gatheral SVI parameters for every live BTC oracle from <code>{(import.meta as any).env?.VITE_API_BASE ?? 'predict-api'}</code>, reconstructing the strike × expiry × IV surface...
                </p>
              )}
            </div>
          </div>
        )}
        {arb && !arb.ok ? (
          <div style={{ position: 'absolute', top: 14, right: 14, background: '#3a0c12', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#ffb3b8' }}>
            arb violations: {arb.violations.join(', ')}
          </div>
        ) : null}
        {current ? (
          <div style={{ position: 'absolute', bottom: 14, left: 14, background: '#0c1118cc', backdropFilter: 'blur(6px)', padding: '10px 14px', borderRadius: 6, fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Selected oracle</div>
            <div style={{ fontFamily: 'monospace' }}>{current.oracleId.slice(0, 22)}...</div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              a={current.svi.a.toFixed(5)}  b={current.svi.b.toFixed(4)}  σ={current.svi.sigma.toFixed(4)}
            </div>
            <div style={{ opacity: 0.7 }}>
              ρ={current.svi.rho.toFixed(4)}  m={current.svi.m.toFixed(4)}
            </div>
          </div>
        ) : null}
      </main>

      <footer style={{ padding: '14px 22px', borderTop: '1px solid #1b2030', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 12, opacity: 0.55, minWidth: 80 }}>oracle pick</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, snapshots.length - 1)}
          value={idx}
          onChange={(e) => setIdx(parseInt(e.target.value, 10))}
          style={{ flex: 1, accentColor: '#5b9dff' }}
          disabled={snapshots.length < 2}
        />
        <span style={{ fontSize: 12, opacity: 0.55, minWidth: 100, textAlign: 'right' }}>
          {snapshots.length ? `${idx + 1} / ${snapshots.length}` : '--'}
        </span>
      </footer>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>
    </div>
  );
}
