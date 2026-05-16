import { fetchDeribitAtmIv } from './deribitClient.js';
import { fetchPolymarketSmile } from './polymarketClient.js';

// Cross-feed orchestrator: pick the best available IV source to pair against Predict.
// Order of preference:
//   1. Deribit ATM IV with expiry within 3 days of the Predict expiry
//      → highest quality, deepest BTC options market on the planet
//   2. Polymarket binary-implied IV (works when Polymarket happens to have
//      a BTC binary aligned with our expiry; rare for 1-2 day Predict expiries)
//   3. Realized vol fallback (if both fail, return NaN with reason for transparency)
//
// Every call returns `source` so the dashboard can label the spread chart honestly.

export async function fetchCrossFeedAtmIv({ targetExpirySec, symbol = 'BTC' } = {}) {
  const errors = {};

  // Path 1: Deribit
  try {
    const d = await fetchDeribitAtmIv({ targetExpirySec, maxExpiryDriftSec: 3 * 86400 });
    if (Number.isFinite(d.atmIv)) {
      return {
        ...d,
        symbol,
        source: 'deribit',
        sourceLabel: `Deribit · ${d.expiryDriftDays?.toFixed(1) ?? '?'}d drift`,
      };
    }
    errors.deribit = d.reason || 'unknown';
  } catch (e) {
    errors.deribit = `error: ${e.message}`;
  }

  // Path 2: Polymarket (legacy)
  try {
    const p = await fetchPolymarketSmile({ symbol });
    if (Number.isFinite(p.atmIv)) {
      return {
        atmIv: p.atmIv,
        spot: null,
        symbol,
        source: 'polymarket',
        sourceLabel: 'Polymarket binary',
        points: p.points,
        errors,
      };
    }
    errors.polymarket = 'no aligned market';
  } catch (e) {
    errors.polymarket = `error: ${e.message}`;
  }

  return {
    atmIv: NaN,
    symbol,
    source: 'none',
    sourceLabel: 'no cross-feed available',
    errors,
  };
}
