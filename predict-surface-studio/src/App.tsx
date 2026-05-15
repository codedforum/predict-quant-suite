import { useEffect, useState } from 'react';
import SurfaceViewer from './components/SurfaceViewer';
import { fetchLatestSviSnapshots, SviSnapshot } from './lib/predictApi';
import { checkArbFree } from './lib/sviMath';

export default function App() {
  const [snapshots, setSnapshots] = useState<SviSnapshot[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const snaps = await fetchLatestSviSnapshots();
        if (cancelled) return;
        setSnapshots(snaps);
        setIdx(snaps.length - 1);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const current = snapshots[idx];
  const arb = current ? checkArbFree(current) : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: '56px 1fr 80px' }}>
      <header style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderBottom: '1px solid #1b2030', justifyContent: 'space-between' }}>
        <strong>Predict Surface Studio</strong>
        <span style={{ opacity: 0.7, fontSize: 13 }}>
          {loading ? 'connecting...' : `${snapshots.length} snapshots | oracle ${current?.oracleId?.slice(0, 10) ?? '-'}`}
        </span>
      </header>

      <main style={{ position: 'relative' }}>
        {current ? <SurfaceViewer snapshot={current} /> : null}
        {arb && !arb.ok ? (
          <div style={{ position: 'absolute', top: 12, right: 12, background: '#3a0c12', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#ffb3b8' }}>
            arb violations: {arb.violations.join(', ')}
          </div>
        ) : null}
      </main>

      <footer style={{ padding: '12px 18px', borderTop: '1px solid #1b2030', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>time-travel</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, snapshots.length - 1)}
          value={idx}
          onChange={(e) => setIdx(parseInt(e.target.value, 10))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {current ? new Date(current.timestampMs).toISOString().slice(11, 19) : '--:--:--'}
        </span>
      </footer>
    </div>
  );
}
