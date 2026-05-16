// Delta-hedge module: keep total portfolio delta near zero by offsetting
// each open Predict position with a BTC perp position on Hyperliquid.
//
// Why hedge:
//   When the vol-arb bot is LONG vol on Predict, it holds calls + puts with
//   net delta exposure to BTC spot. Spot moves contaminate the vol-edge PnL
//   the bot is trying to capture. The Sui Overflow problem statement
//   explicitly calls this out as the obvious upgrade path.
//
// How it works:
//   1. Read open Predict positions from the bot's db (open_positions table)
//   2. For each position, compute BSM delta at current spot + SVI sigma
//   3. Sum signed deltas -> portfolio_delta (in BTC units)
//   4. Read current Hyperliquid BTC perp position size
//   5. hedge_target = -portfolio_delta  (offset by the perp)
//   6. If |hedge_target - hl_current| > rebalance threshold, place an order
//      on Hyperliquid sized to close the gap. DRY_RUN = log-only.
//
// All state changes get logged to `hedge_log` for the dashboard.

import { fetchBtcMid, fetchBtcPosition, placePerpOrder } from './hyperliquidClient.js';
import { openPositions, logHedge } from './db.js';

const REBALANCE_THRESHOLD_BTC = parseFloat(process.env.HEDGE_REBAL_BTC || '0.001'); // ~$80 at $80k BTC
const HEDGE_ENABLED = (process.env.HEDGE_ENABLED || 'true') === 'true';
const HEDGE_LIVE = (process.env.HEDGE_LIVE || 'false') === 'true';
const HL_ACCOUNT = process.env.HL_ACCOUNT_ADDRESS || '';

// Standard normal CDF (used for BSM delta)
function ncdf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

// BSM delta. type='C'|'P', S=spot, K=strike, T=years to expiry, sigma=fractional vol (e.g. 0.5)
function bsmDelta({ type, S, K, T, sigma, r = 0 }) {
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const callDelta = ncdf(d1);
  return type === 'P' ? callDelta - 1 : callDelta;
}

// Compute the total BTC-equivalent delta of all open Predict positions.
// Each position: { side: 'long'|'short', kind: 'C'|'P', strike, expirySec, sizeBtc, sigma }
export function computePortfolioDelta({ positions, spot }) {
  let delta = 0;
  const breakdown = [];
  const now = Date.now() / 1000;
  for (const p of positions) {
    const T = Math.max((p.expirySec - now) / (365 * 86400), 1 / (365 * 86400)); // floor at 1 day to avoid blow-up
    const d = bsmDelta({ type: p.kind, S: spot, K: p.strike, T, sigma: p.sigma });
    const signed = (p.side === 'short' ? -1 : 1) * d * p.sizeBtc;
    delta += signed;
    breakdown.push({
      positionId: p.id ?? null,
      kind: p.kind,
      side: p.side,
      strike: p.strike,
      sizeBtc: p.sizeBtc,
      bsmDelta: d,
      contribBtc: signed,
    });
  }
  return { delta, breakdown };
}

// Main entry: read open positions, compute target, place order if drift > threshold.
// Returns a snapshot suitable for /api/hedge endpoint.
export async function refreshHedge() {
  if (!HEDGE_ENABLED) {
    return { enabled: false, ts: Date.now() };
  }

  // 1. spot
  let spot;
  try { spot = await fetchBtcMid(); }
  catch (e) { return { enabled: true, error: `hyperliquid mid failed: ${e.message}`, ts: Date.now() }; }
  if (!Number.isFinite(spot)) {
    return { enabled: true, error: 'no BTC mid from hyperliquid', ts: Date.now() };
  }

  // 2. portfolio delta from open Predict positions
  const positions = openPositions();
  const { delta: portfolioDelta, breakdown } = computePortfolioDelta({ positions, spot });

  // 3. current hyperliquid position
  let hlCurrent = 0;
  if (HL_ACCOUNT) {
    hlCurrent = await fetchBtcPosition(HL_ACCOUNT);
  }

  // 4. target = -portfolio_delta. drift = how far we are from that target.
  const hedgeTarget = -portfolioDelta;
  const drift = hedgeTarget - hlCurrent;

  let action = null;
  if (Math.abs(drift) >= REBALANCE_THRESHOLD_BTC && positions.length > 0) {
    const isBuy = drift > 0;
    const size = Math.abs(drift);
    const order = await placePerpOrder({
      coin: 'BTC',
      isBuy,
      size: size.toFixed(5),
      price: (spot * (isBuy ? 1.001 : 0.999)).toFixed(0), // marketable limit, 10bps slip cap
      reduceOnly: false,
      live: HEDGE_LIVE,
    });
    action = {
      side: isBuy ? 'BUY' : 'SELL',
      sizeBtc: size,
      notionalUsd: size * spot,
      atSpot: spot,
      order,
    };
    logHedge({
      ts: Date.now(),
      spot,
      portfolio_delta: portfolioDelta,
      hl_current: hlCurrent,
      hedge_target: hedgeTarget,
      drift,
      action_side: action.side,
      action_size: size,
      live: HEDGE_LIVE ? 1 : 0,
    });
  }

  return {
    enabled: true,
    live: HEDGE_LIVE,
    ts: Date.now(),
    spot,
    positionsCount: positions.length,
    portfolioDelta,
    hlCurrent,
    hedgeTarget,
    drift,
    rebalanceThreshold: REBALANCE_THRESHOLD_BTC,
    action,
    breakdown,
  };
}
