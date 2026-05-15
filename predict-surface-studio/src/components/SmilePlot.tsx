import { useMemo } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const W = 800;
const H = 200;
const MX = 50;
const MY = 24;
const N = 60;
const K_MIN = -0.5;
const K_MAX = 0.5;

export default function SmilePlot({ snapshot }: { snapshot: SviSnapshot }) {
  const { path, fill, atmIv, ivMin, ivMax, T } = useMemo(() => {
    const T = snapshot.expirySec
      ? Math.max(snapshot.expirySec - Date.now() / 1000, 60) / (365 * 86400)
      : 1 / 12;
    const ks = Array.from({ length: N }, (_, i) => K_MIN + (i / (N - 1)) * (K_MAX - K_MIN));
    const ivs = ks.map((k) => iv(snapshot.svi, k, T));
    const lo = Math.min(...ivs);
    const hi = Math.max(...ivs);
    const span = Math.max(hi - lo, 1e-3);
    const yScale = (v: number) => H - MY - ((v - lo) / span) * (H - MY * 2);
    const xScale = (k: number) => MX + ((k - K_MIN) / (K_MAX - K_MIN)) * (W - MX * 1.4);
    const pts = ks.map((k, i) => `${xScale(k).toFixed(1)},${yScale(ivs[i]).toFixed(1)}`);
    const path = 'M' + pts.join(' L');
    const fill = path + ` L ${xScale(K_MAX).toFixed(1)},${(H - MY).toFixed(1)} L ${xScale(K_MIN).toFixed(1)},${(H - MY).toFixed(1)} Z`;
    return { path, fill, atmIv: iv(snapshot.svi, 0, T), ivMin: lo, ivMax: hi, T };
  }, [snapshot]);

  const xMid = MX + ((W - MX * 1.4) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="smile-svg" preserveAspectRatio="none">
      {/* horizontal grid */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="smile-grid" x1={MX} x2={W - MX * 0.4} y1={MY + (H - MY * 2) * f} y2={MY + (H - MY * 2) * f} />
      ))}
      {/* axis */}
      <line className="smile-axis" x1={MX} x2={W - MX * 0.4} y1={H - MY} y2={H - MY} />
      <line className="smile-axis" x1={MX} x2={MX} y1={MY} y2={H - MY} />
      {/* fill under curve */}
      <path className="smile-fill" d={fill} />
      {/* curve */}
      <path className="smile-line" d={path} />
      {/* ATM marker */}
      <line className="smile-marker" x1={xMid} x2={xMid} y1={MY} y2={H - MY} />
      <text className="smile-label" x={xMid + 4} y={MY + 12}>ATM</text>
      {/* axis labels */}
      <text className="smile-label" x={MX} y={H - 6}>k = -0.5</text>
      <text className="smile-label" x={W - MX * 0.4} y={H - 6} textAnchor="end">k = +0.5</text>
      <text className="smile-label" x={6} y={MY + 8}>{(ivMax * 100).toFixed(1)}%</text>
      <text className="smile-label" x={6} y={H - MY + 4}>{(ivMin * 100).toFixed(1)}%</text>
      {/* readout */}
      <text className="smile-readout" x={W - MX * 0.4} y={MY + 10} textAnchor="end">
        ATM IV {(atmIv * 100).toFixed(2)}%   ·   T = {(T * 365).toFixed(1)}d
      </text>
    </svg>
  );
}
