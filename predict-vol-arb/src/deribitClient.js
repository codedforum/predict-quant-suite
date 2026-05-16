import axios from 'axios';

// Deribit is the deepest BTC options venue with public, no-auth pricing.
// Its mark_iv is published per-instrument in percentage units (52.03 = 52.03% annualized).
// We use it as the primary cross-feed for vol-arb because, unlike Polymarket binaries,
// Deribit has dense short-dated strikes (next-day, 2-day, weekly) that align with
// Predict's 1-2 day expiries.

const BASE = process.env.DERIBIT_API || 'https://www.deribit.com/api/v2';
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

let _cache = { ts: 0, data: null };
const CACHE_MS = 15_000;

// Parse Deribit instrument name. e.g. BTC-18MAY26-73000-P
function parseInstrument(name) {
  const m = /^BTC-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-([CP])$/.exec(name);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS[m[2]];
  const year = 2000 + parseInt(m[3], 10);
  if (mon == null) return null;
  // Deribit expiries settle at 08:00 UTC
  const expirySec = Math.floor(Date.UTC(year, mon, day, 8, 0, 0) / 1000);
  return { strike: parseInt(m[4], 10), type: m[5], expirySec };
}

export async function fetchDeribitSummary() {
  if (Date.now() - _cache.ts < CACHE_MS && _cache.data) return _cache.data;
  const r = await axios.get(`${BASE}/public/get_book_summary_by_currency`, {
    params: { currency: 'BTC', kind: 'option' },
    timeout: 5000,
  });
  const items = (r.data?.result ?? []).map((op) => {
    const parsed = parseInstrument(op.instrument_name);
    if (!parsed) return null;
    const iv = Number(op.mark_iv);
    if (!Number.isFinite(iv) || iv <= 0) return null;
    return {
      name: op.instrument_name,
      strike: parsed.strike,
      type: parsed.type,
      expirySec: parsed.expirySec,
      ivPct: iv,          // raw % units, 52.03 = 52.03%
      iv: iv / 100,       // fractional, 0.5203
      spot: Number(op.underlying_price) || null,
      volume: Number(op.volume) || 0,
      openInterest: Number(op.open_interest) || 0,
    };
  }).filter(Boolean);
  _cache = { ts: Date.now(), data: items };
  return items;
}

// Pick the Deribit ATM IV for the expiry closest to `targetExpirySec`.
// We average call+put ATM IVs (the two closest strikes either side of spot) for stability.
export async function fetchDeribitAtmIv({ targetExpirySec, maxExpiryDriftSec = 7 * 86400 } = {}) {
  const items = await fetchDeribitSummary();
  if (!items.length) return { atmIv: NaN, source: 'deribit', reason: 'no instruments' };

  // Pick spot from any instrument (they all carry the same underlying price)
  const spot = items.find((it) => Number.isFinite(it.spot))?.spot;
  if (!Number.isFinite(spot)) return { atmIv: NaN, source: 'deribit', reason: 'no spot' };

  // Group by expiry
  const byExpiry = new Map();
  for (const it of items) {
    if (!byExpiry.has(it.expirySec)) byExpiry.set(it.expirySec, []);
    byExpiry.get(it.expirySec).push(it);
  }

  // Pick the expiry closest to target (if no target, use the soonest expiry > 12h away)
  const now = Date.now() / 1000;
  let chosenExpiry = null;
  let minDrift = Infinity;
  for (const exp of byExpiry.keys()) {
    if (exp - now < 12 * 3600) continue; // skip expiries < 12h away (illiquid, last-hour gamma noise)
    const drift = targetExpirySec ? Math.abs(exp - targetExpirySec) : exp - now;
    if (drift < minDrift) { minDrift = drift; chosenExpiry = exp; }
  }
  if (chosenExpiry == null) {
    return { atmIv: NaN, source: 'deribit', reason: 'no expiry within window', candidates: byExpiry.size };
  }
  if (targetExpirySec && minDrift > maxExpiryDriftSec) {
    return {
      atmIv: NaN, source: 'deribit', reason: `nearest expiry ${(minDrift / 86400).toFixed(1)}d off target`,
      chosenExpiry, candidates: byExpiry.size,
    };
  }

  // ATM = average IV of the two strikes bracketing spot (one each side, call+put)
  const list = byExpiry.get(chosenExpiry);
  list.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
  const atmCandidates = list.slice(0, 4);
  const ivs = atmCandidates.map((it) => it.iv).filter(Number.isFinite);
  if (!ivs.length) return { atmIv: NaN, source: 'deribit', reason: 'no IV near spot' };
  const atmIv = ivs.reduce((a, b) => a + b, 0) / ivs.length;

  return {
    atmIv,
    spot,
    expirySec: chosenExpiry,
    expiryDriftSec: targetExpirySec ? minDrift : null,
    expiryDriftDays: targetExpirySec ? minDrift / 86400 : null,
    instruments: atmCandidates.map((it) => ({ name: it.name, strike: it.strike, iv: it.iv })),
    source: 'deribit',
  };
}

// Smile shape for a given expiry (for the Compare view in Surface Studio)
export async function fetchDeribitSmile({ targetExpirySec, maxExpiryDriftSec = 7 * 86400 } = {}) {
  const items = await fetchDeribitSummary();
  if (!items.length) return { points: [], source: 'deribit' };
  const spot = items.find((it) => Number.isFinite(it.spot))?.spot;
  if (!Number.isFinite(spot)) return { points: [], source: 'deribit' };

  const byExpiry = new Map();
  for (const it of items) {
    if (!byExpiry.has(it.expirySec)) byExpiry.set(it.expirySec, []);
    byExpiry.get(it.expirySec).push(it);
  }
  const now = Date.now() / 1000;
  let chosenExpiry = null;
  let minDrift = Infinity;
  for (const exp of byExpiry.keys()) {
    if (exp - now < 12 * 3600) continue;
    const drift = targetExpirySec ? Math.abs(exp - targetExpirySec) : exp - now;
    if (drift < minDrift) { minDrift = drift; chosenExpiry = exp; }
  }
  if (chosenExpiry == null || (targetExpirySec && minDrift > maxExpiryDriftSec)) {
    return { points: [], source: 'deribit', expiryDriftDays: chosenExpiry ? minDrift / 86400 : null };
  }
  const list = byExpiry.get(chosenExpiry).sort((a, b) => a.strike - b.strike);
  const points = list.map((it) => ({
    strike: it.strike,
    logMoneyness: Math.log(it.strike / spot),
    iv: it.iv,
    type: it.type,
    volume: it.volume,
  }));
  return { points, spot, expirySec: chosenExpiry, source: 'deribit' };
}
