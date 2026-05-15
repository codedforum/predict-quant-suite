import { useEffect, useRef } from 'react';
import { SurfaceResponse, Stats, SviSnapshot } from '../lib/predictApi';
import { iv as sviIv } from '../lib/sviMath';

function useFlashOnChange(value: number | string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prev = useRef<number | string | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== value && ref.current) {
      ref.current.classList.remove('kpi-flash');
      void ref.current.offsetWidth;
      ref.current.classList.add('kpi-flash');
    }
    prev.current = value;
  }, [value]);
  return ref;
}

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

  const fwdRef = useFlashOnChange(surface ? surface.primary.forward.toFixed(0) : '--');
  const ivRef  = useFlashOnChange(current ? atmIv.toFixed(2) : '--');
  const oraRef = useFlashOnChange(oracles.length);
  const mintRef = useFlashOnChange(mintCount);
  const winRef = useFlashOnChange(biggestPayout);

  return (
    <section className="hero">
      <h1>
        On-chain <span className="h-grad">volatility surface</span><br />
        and vol-arb monitor.
      </h1>

      <p className="lede">
        Stream the Gatheral SVI parameterization from on-chain oracles, watch every BTC binary mint and settle, and monitor the cross-venue vol spread against Polymarket. Read-only, no wallet needed.
      </p>

      <div className="live-grid">
        <div className="live-card">
          <div className="v" ref={fwdRef as any}>{surface ? `$${surface.primary.forward.toFixed(0)}` : '--'}</div>
          <div className="l">BTC FORWARD</div>
        </div>
        <div className="live-card">
          <div className="v" ref={ivRef as any}>{current ? `${(atmIv * 100).toFixed(1)}%` : '--'}</div>
          <div className="l">ATM IV</div>
        </div>
        <div className="live-card">
          <div className="v" ref={oraRef as any}>{oracles.length || '--'}</div>
          <div className="l">LIVE ORACLES</div>
        </div>
        <div className="live-card">
          <div className="v" ref={mintRef as any}>{stats ? mintCount : '--'}</div>
          <div className="l">24H MINTS</div>
          <div className="sub">${stats ? stats.mint_volume_dusdc.toFixed(0) : '0'} notional</div>
        </div>
        <div className="live-card">
          <div className="v green" ref={winRef as any}>{stats ? `$${biggestPayout.toFixed(0)}` : '--'}</div>
          <div className="l">BIGGEST 24H WIN</div>
          <div className="sub">${paidOut.toFixed(0)} paid out</div>
        </div>
      </div>
    </section>
  );
}
