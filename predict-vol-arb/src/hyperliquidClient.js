import axios from 'axios';

// Hyperliquid is the chosen delta-hedge venue: deep BTC perp orderbook,
// fast settlement, public REST for reads, EIP-712 signing for writes.
// We read prices from MAINNET (cheap, accurate) and route hedge orders to
// either TESTNET or MAINNET via HL_NETWORK env.

const NETWORK = (process.env.HL_NETWORK || 'mainnet').toLowerCase();
const BASE = NETWORK === 'testnet'
  ? (process.env.HL_API_TESTNET || 'https://api.hyperliquid-testnet.xyz')
  : (process.env.HL_API || 'https://api.hyperliquid.xyz');

let _midsCache = { ts: 0, data: null };
const MIDS_CACHE_MS = 5_000;

async function info(payload) {
  const r = await axios.post(`${BASE}/info`, payload, {
    headers: { 'content-type': 'application/json' },
    timeout: 5000,
  });
  return r.data;
}

export async function fetchAllMids() {
  if (Date.now() - _midsCache.ts < MIDS_CACHE_MS && _midsCache.data) return _midsCache.data;
  const data = await info({ type: 'allMids' });
  _midsCache = { ts: Date.now(), data };
  return data;
}

export async function fetchBtcMid() {
  const mids = await fetchAllMids();
  const px = Number(mids?.BTC);
  return Number.isFinite(px) ? px : NaN;
}

export async function fetchMeta() {
  return info({ type: 'meta' });
}

// Look up the user's current state on Hyperliquid (open positions, margin, withdrawable).
// Used to confirm the hedge actually landed and to detect drift between
// our shadow-state and the venue's reality.
export async function fetchUserState(address) {
  if (!address) return null;
  return info({ type: 'clearinghouseState', user: address });
}

// Pull our current BTC perp position size (signed, in BTC).
// Returns 0 if no position or address missing.
export async function fetchBtcPosition(address) {
  if (!address) return 0;
  try {
    const state = await fetchUserState(address);
    const pos = (state?.assetPositions || []).find((p) => p?.position?.coin === 'BTC');
    if (!pos) return 0;
    return Number(pos.position.szi) || 0; // signed: positive = long, negative = short
  } catch (e) {
    console.warn('hyperliquid fetchBtcPosition failed:', e.message);
    return 0;
  }
}

// Place an order on Hyperliquid. Wallet signing is scaffolded but gated by
// `live` mode + HL_PRIVATE_KEY env. In DRY_RUN we return the would-be payload.
// Full signing implementation lives in the @nktkas/hyperliquid SDK (Wave 2 work).
export async function placePerpOrder({
  coin = 'BTC', isBuy, size, price, reduceOnly = false, live = false,
}) {
  const payload = {
    action: {
      type: 'order',
      orders: [{ a: 0 /* BTC asset id; fetched from meta in live mode */, b: isBuy, p: String(price), s: String(size), r: reduceOnly, t: { limit: { tif: 'Gtc' } } }],
      grouping: 'na',
    },
    nonce: Date.now(),
    network: NETWORK,
  };
  if (!live) {
    return { simulated: true, payload, reason: 'DRY_RUN' };
  }
  if (!process.env.HL_PRIVATE_KEY) {
    return { simulated: true, payload, reason: 'no HL_PRIVATE_KEY set' };
  }
  // TODO Wave 2: sign action via EIP-712 (Hyperliquid l1 signature scheme) and POST to /exchange
  return { simulated: true, payload, reason: 'signing pending — see SDK integration in Wave 2' };
}
