import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recentQuotes, recentTrades } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://predict.smartcoded.xyz,http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/state', (req, res) => {
  res.json({
    quotes: recentQuotes(300),
    trades: recentTrades(50),
    pnl: recentTrades(10000).reduce((s, t) => s + (t.realized || 0), 0),
  });
});

// SVI surface for the frontend - hits the chain via predictClient with a 30s cache.
import { listOracles, fetchPredictSurface } from '../predictClient.js';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC || getFullnodeUrl('testnet') });
const PKG = process.env.PREDICT_PKG || '';

let surfaceCache = { data: null, ts: 0 };
app.get('/api/surface', async (req, res) => {
  try {
    if (Date.now() - surfaceCache.ts < 30_000 && surfaceCache.data) {
      return res.json({ ...surfaceCache.data, cache: 'hit' });
    }
    const [primary, oracles] = await Promise.all([
      fetchPredictSurface({ symbol: 'BTC' }),
      listOracles({ symbol: 'BTC', windowMs: 5 * 60_000 }),
    ]);
    const out = {
      ts: Date.now(),
      primary: { ...primary, smile: undefined },
      oracles,
      source: primary.source,
    };
    surfaceCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Recent Predict on-chain activity. 10s cache. Pulls multiple event types in parallel.
let activityCache = { data: null, ts: 0 };
const EVENT_TYPES = [
  { kind: 'PositionMinted',     type: 'predict::PositionMinted',
    summary: (p) => `${p.is_up ? 'CALL' : 'PUT'} k=${(Number(p.strike) / 1e9).toFixed(0)} q=${p.quantity} cost=${(Number(p.cost) / 1e6).toFixed(2)} dUSDC` },
  { kind: 'PositionRedeemed',   type: 'predict::PositionRedeemed',
    summary: (p) => `${p.is_up ? 'CALL' : 'PUT'} k=${(Number(p.strike) / 1e9).toFixed(0)} payout=${(Number(p.payout) / 1e6).toFixed(2)} ${p.is_settled ? '(settled)' : ''}` },
  { kind: 'RangeMinted',        type: 'predict::RangeMinted',
    summary: (p) => `range [${(Number(p.lower_strike) / 1e9).toFixed(0)},${(Number(p.higher_strike) / 1e9).toFixed(0)}] q=${p.quantity}` },
  { kind: 'OracleSettled',      type: 'oracle::OracleSettled',
    summary: (p) => `oracle ${String(p.oracle_id).slice(0,12)}... settled at $${(Number(p.settlement_price) / 1e9).toFixed(2)}` },
  { kind: 'Supplied',           type: 'predict::Supplied',
    summary: (p) => `+${(Number(p.amount) / 1e6).toFixed(2)} dUSDC PLP supply (shares ${p.shares_minted})` },
  { kind: 'Withdrawn',          type: 'predict::Withdrawn',
    summary: (p) => `-${(Number(p.amount) / 1e6).toFixed(2)} dUSDC PLP withdraw` },
];
app.get('/api/activity', async (req, res) => {
  try {
    if (Date.now() - activityCache.ts < 10_000 && activityCache.data) return res.json({ ...activityCache.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const results = await Promise.all(EVENT_TYPES.map(async (cfg) => {
      try {
        const r = await sui.queryEvents({ query: { MoveEventType: `${PKG}::${cfg.type}` }, limit: 10, order: 'descending' });
        return r.data.map((ev) => ({
          kind: cfg.kind,
          timestampMs: Number(ev.timestampMs),
          txDigest: ev.id?.txDigest || '',
          summary: cfg.summary(ev.parsedJson || {}),
        }));
      } catch { return []; }
    }));
    const events = results.flat().sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 60);
    const out = { ts: Date.now(), events };
    activityCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.DASHBOARD_PORT || '3097', 10);
app.listen(PORT, () => console.log(`vol-arb dashboard on :${PORT} (CORS: ${ALLOWED_ORIGINS.join(', ')})`));
