import axios from 'axios';
import { iv as sviIv } from './sviMath.js';

const BASE = process.env.PREDICT_SERVER || 'https://predict-server.testnet.mystenlabs.com';
const FLOAT_SCALING = 1e9;

// Decode the on-chain I64 type ({ magnitude: u64-string, is_negative: bool }) into a signed JS number.
function decodeI64(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  const mag = Number(v.magnitude ?? v.value ?? 0);
  return v.is_negative ? -mag : mag;
}

// Decode an SVIParams object straight from a Move event/object into a normalized
// floating-point shape ready for the JS SVI math.
export function decodeSvi(raw) {
  if (!raw) return null;
  return {
    a: Number(raw.a) / FLOAT_SCALING,
    b: Number(raw.b) / FLOAT_SCALING,
    rho: decodeI64(raw.rho) / FLOAT_SCALING,
    m: decodeI64(raw.m) / FLOAT_SCALING,
    sigma: Number(raw.sigma) / FLOAT_SCALING,
  };
}

// Returns the latest SVI snapshot for a given symbol (e.g. BTC).
// Falls back to throwing - caller decides how to handle (skip iteration, kill switch, etc).
export async function fetchPredictSurface({ symbol = 'BTC' } = {}) {
  const r = await axios.get(`${BASE}/api/oracles/svi`, { params: { symbol, limit: 1 } });
  const snap = r.data?.snapshots?.[0] ?? r.data?.[0] ?? r.data;
  if (!snap) throw new Error('no predict snapshot');

  const svi = decodeSvi(snap.svi ?? snap);
  const forward = Number(snap.forward ?? snap.forward_price ?? 0) / FLOAT_SCALING;
  const expirySec = Number(snap.expiry ?? snap.expirySec ?? 0);
  const T = Math.max(expirySec - Date.now() / 1000, 60) / (365 * 86400);

  return {
    symbol,
    oracleId: snap.oracle_id ?? snap.oracleId,
    forward,
    expirySec,
    svi,
    atmIv: sviIv(svi, 0, T),
    smile: (k) => sviIv(svi, k, T),
    raw: snap,
  };
}
