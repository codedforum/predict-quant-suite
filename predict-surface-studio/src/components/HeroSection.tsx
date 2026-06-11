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

const MINT_TX = 'https://suiscan.xyz/testnet/tx/72fCQQxEgMsvFx5s78NLajCQYKM5aTeBWEQtozZGT3hr';
const REDEEM_TX = 'https://suiscan.xyz/testnet/tx/DuKoWRSUvd2XyU2f73LmQeAJK6AQCw8De12vdCujtt8v';

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
      <div className="hero-brand">
        <img src="/mark.svg" className="hero-mark" alt="" width={44} height={44} />
        <div>
          <div className="hero-name">Predict Quant Suite</div>
          <div className="hero-cobrand">by <b className="bc-sc">SmartCodedBot</b> · <b className="bc-db">DeepBook</b> × <b className="bc-sui">Sui</b></div>
        </div>
      </div>

      <h1>
        The on-chain options terminal for <span className="h-grad">DeepBook Predict</span>.
      </h1>

      <p className="lede">
        A live 3D volatility-surface viewer, a vol-arb keeper that prices Predict IV against a Deribit cross-feed every 15 seconds, and a trade calculator. It does not just watch the market, it trades it on-chain.
      </p>

      <div className="pillars">
        <div className="pillar">
          <div className="pillar-ic">◆</div>
          <div className="pillar-h">3D Vol Surface</div>
          <div className="pillar-d">Every Predict oracle's implied-vol surface, live from on-chain SVI. Smile, term structure, and a realized-vs-implied cone.</div>
        </div>
        <div className="pillar">
          <div className="pillar-ic">⇄</div>
          <div className="pillar-h">Vol-Arb Keeper</div>
          <div className="pillar-d">Prices Predict IV vs a Deribit cross-feed every 15s, surfaces arbitrage, and delta-hedges on Hyperliquid.</div>
        </div>
        <div className="pillar">
          <div className="pillar-ic">⚡</div>
          <div className="pillar-h">Real On-chain Trades</div>
          <div className="pillar-d">Create a manager, deposit dUSDC, mint a position, redeem for profit. Proven end-to-end on testnet, not a mockup.</div>
        </div>
      </div>

      <div className="proof-row">
        <span className="proof-label">Proven on Sui testnet</span>
        <a className="proof-link" href={MINT_TX} target="_blank" rel="noreferrer">mint ↗</a>
        <a className="proof-link" href={REDEEM_TX} target="_blank" rel="noreferrer">redeem (+profit) ↗</a>
        <a className="proof-link ghost" href="https://github.com/codedforum/predict-quant-suite" target="_blank" rel="noreferrer">source ↗</a>
      </div>

      <a className="hero-bot" href="https://t.me/TheSmartPredictBot" target="_blank" rel="noreferrer">
        <span className="hb-ic">✈</span>
        <div className="hb-text">
          <div className="hb-h">Also live: trade from Telegram</div>
          <div className="hb-d"><b>@TheSmartPredictBot</b>, one-tap up or down on BTC with a real testnet faucet. Self custody, you own the wallet.</div>
        </div>
        <span className="hb-cta">Open ↗</span>
      </a>

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
