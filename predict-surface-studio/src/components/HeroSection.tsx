import { SurfaceResponse, Stats, SviSnapshot } from '../lib/predictApi';
import { iv as sviIv } from '../lib/sviMath';

interface Props {
  surface: SurfaceResponse | null;
  oracles: SviSnapshot[];
  current: SviSnapshot | undefined;
  stats: Stats | null;
}

export default function HeroSection({ surface, oracles, current, stats }: Props) {
  const atmIv = current ? (() => {
    const T = current.expirySec ? Math.max(current.expirySec - Date.now() / 1000, 60) / (365 * 86400) : 1 / 12;
    return sviIv(current.svi, 0, T);
  })() : 0;

  const mintCount = stats?.mints ?? 0;
  const biggestPayout = stats?.biggest_payout?.payout_dusdc ?? 0;
  const paidOut = stats?.payout_volume_dusdc ?? 0;

  return (
    <section className="hero">
      <span className="hero-tag">
        <span className="hero-tag-dot" />
        ON-CHAIN · SUI TESTNET · {surface?.source?.toUpperCase() || 'CONNECTING'}
      </span>

      <h1>
        Live <span className="h-grad">volatility surface</span><br />
        for DeepBook Predict.
      </h1>

      <p className="lede">
        Stream the Gatheral SVI parameterization from on-chain oracles, watch every BTC binary mint and settle, monitor the cross-venue vol spread vs Polymarket. All on-chain, no wallet connection needed.
      </p>

      <div className="live-grid">
        <div className="live-card">
          <div className="v">{surface ? `$${surface.primary.forward.toFixed(0)}` : '--'}</div>
          <div className="l">BTC FORWARD</div>
        </div>
        <div className="live-card">
          <div className="v">{current ? `${(atmIv * 100).toFixed(1)}%` : '--'}</div>
          <div className="l">ATM IV</div>
        </div>
        <div className="live-card">
          <div className="v">{oracles.length || '--'}</div>
          <div className="l">LIVE ORACLES</div>
        </div>
        <div className="live-card">
          <div className="v">{stats ? mintCount : '--'}</div>
          <div className="l">24H MINTS</div>
          <div className="sub">${stats ? stats.mint_volume_dusdc.toFixed(0) : '0'} notional</div>
        </div>
        <div className="live-card">
          <div className="v green">{stats ? `$${biggestPayout.toFixed(0)}` : '--'}</div>
          <div className="l">BIGGEST 24H WIN</div>
          <div className="sub">${paidOut.toFixed(0)} paid out</div>
        </div>
      </div>
    </section>
  );
}
