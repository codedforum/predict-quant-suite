import { useEffect, useState } from 'react';
import { SurfaceResponse, SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

interface Props {
  surface: SurfaceResponse | null;
  oracles: SviSnapshot[];
  current: SviSnapshot | undefined;
  error: string | null;
}

const VERSION = 'v5.0';

export default function StatusBar({ surface, oracles, current, error }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdate = surface ? surface.ts : null;
  const ageSec = lastUpdate ? Math.floor((now - lastUpdate) / 1000) : null;
  const atmIv = current ? (() => {
    const T = current.expirySec ? Math.max(current.expirySec - now / 1000, 60) / (365 * 86400) : 1 / 12;
    return iv(current.svi, 0, T);
  })() : 0;

  return (
    <div className="status-bar">
      <div className="group">
        <span><span className="label">net</span> <span className="value">sui-testnet</span></span>
        {surface && <span className={'source-pill ' + surface.source}>{surface.source}</span>}
        {error && <span style={{ color: 'var(--bad)' }}>{error}</span>}
      </div>
      <div className="group">
        {surface && <span><span className="label">btc fwd</span> <span className="value">${surface.primary.forward.toFixed(2)}</span></span>}
        {current && <span><span className="label">atm iv</span> <span className="value">{(atmIv * 100).toFixed(2)}%</span></span>}
        <span><span className="label">oracles</span> <span className="value">{oracles.length}</span></span>
        {ageSec !== null && (
          <span><span className="label">last</span> <span className="value">{ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec/60)}m ago`}</span></span>
        )}
        <span style={{ opacity: 0.5 }}>{VERSION}</span>
      </div>
    </div>
  );
}
