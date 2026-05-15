import axios from 'axios';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { iv as sviIv } from './sviMath.js';

const INDEXER = process.env.PREDICT_SERVER || 'https://predict-server.testnet.mystenlabs.com';
const RPC = process.env.SUI_RPC || getFullnodeUrl('testnet');
const PKG = process.env.PREDICT_PKG || '';
const FLOAT_SCALING = 1e9;

const client = new SuiClient({ url: RPC });

// Decode the on-chain I64 type ({ magnitude: u64-string, is_negative: bool }) into a signed JS number.
function decodeI64(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  const mag = Number(v.magnitude ?? v.value ?? 0);
  return v.is_negative ? -mag : mag;
}

// Decode raw SVIParams (chain encoding) into floating-point JS shape.
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

// Build a surface object from a raw SVI snapshot.
function makeSurface({ symbol, oracleId, forward, expirySec, sviRaw, source }) {
  const svi = decodeSvi(sviRaw);
  const T = Math.max(expirySec - Date.now() / 1000, 60) / (365 * 86400);
  return {
    symbol, source, oracleId, forward, expirySec, svi,
    atmIv: sviIv(svi, 0, T),
    smile: (k) => sviIv(svi, k, T),
  };
}

// Pull the latest SVI snapshot. Tries the public indexer first (cheap, fast),
// falls back to a direct on-chain event query (always works).
export async function fetchPredictSurface({ symbol = 'BTC', oracleId } = {}) {
  // Path 1: indexer
  try {
    const r = await axios.get(`${INDEXER}/api/oracles/svi`, { params: { symbol, limit: 1 }, timeout: 4000 });
    const snap = r.data?.snapshots?.[0] ?? r.data?.[0];
    if (snap) {
      return makeSurface({
        symbol,
        oracleId: snap.oracle_id ?? snap.oracleId,
        forward: Number(snap.forward ?? snap.forward_price ?? 0) / FLOAT_SCALING,
        expirySec: Number(snap.expiry ?? snap.expirySec ?? 0),
        sviRaw: snap.svi ?? snap,
        source: 'indexer',
      });
    }
  } catch (e) {
    // 404 or wrong path - fall through to chain-direct
  }

  // Path 2: chain-direct
  if (!PKG) throw new Error('PREDICT_PKG required for chain-direct fallback');

  const sviEvents = await client.queryEvents({
    query: { MoveEventType: `${PKG}::oracle::OracleSVIUpdated` },
    limit: oracleId ? 50 : 1,
    order: 'descending',
  });
  let sviEv = sviEvents.data[0];
  if (oracleId) sviEv = sviEvents.data.find((e) => e.parsedJson?.oracle_id === oracleId) || sviEv;
  if (!sviEv) throw new Error('no on-chain SVI events found');

  const targetOracle = sviEv.parsedJson.oracle_id;

  // Get matching forward price + expiry
  const priceEvents = await client.queryEvents({
    query: { MoveEventType: `${PKG}::oracle::OraclePricesUpdated` },
    limit: 50,
    order: 'descending',
  });
  const priceEv = priceEvents.data.find((e) => e.parsedJson?.oracle_id === targetOracle);

  // Read the OracleSVI object for expiry (not in events)
  let expirySec = 0;
  try {
    const obj = await client.getObject({ id: targetOracle, options: { showContent: true } });
    const fields = obj.data?.content?.fields ?? {};
    expirySec = Number(fields.expiry ?? fields.expiry_ms ?? 0);
    if (expirySec > 1e12) expirySec = Math.floor(expirySec / 1000); // ms→s if needed
  } catch (_) { /* fallback: leave as 0 */ }

  return makeSurface({
    symbol,
    oracleId: targetOracle,
    forward: Number(priceEv?.parsedJson?.forward ?? 0) / FLOAT_SCALING,
    expirySec,
    sviRaw: sviEv.parsedJson,
    source: 'chain',
  });
}

// Discover all live BTC oracles by walking recent SVI events.
export async function listOracles({ symbol = 'BTC', windowMs = 5 * 60_000 } = {}) {
  if (!PKG) return [];
  const r = await client.queryEvents({
    query: { MoveEventType: `${PKG}::oracle::OracleSVIUpdated` },
    limit: 50,
    order: 'descending',
  });
  const cutoff = Date.now() - windowMs;
  const seen = new Set();
  const out = [];
  for (const ev of r.data) {
    const id = ev.parsedJson?.oracle_id;
    if (!id || seen.has(id) || Number(ev.timestampMs) < cutoff) continue;
    seen.add(id);
    out.push({ oracleId: id, lastUpdateMs: Number(ev.timestampMs), svi: decodeSvi(ev.parsedJson) });
  }
  return out;
}
