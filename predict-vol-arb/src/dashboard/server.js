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

// 24h rolled-up stats. 60s cache. Aggregates from on-chain events.
let statsCache = { data: null, ts: 0 };
app.get('/api/stats', async (req, res) => {
  try {
    if (Date.now() - statsCache.ts < 60_000 && statsCache.data) return res.json({ ...statsCache.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const since = Date.now() - 24 * 3600_000;
    const [mints, redeems, settles, supplied] = await Promise.all([
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionMinted` },     limit: 50, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionRedeemed` },   limit: 50, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::oracle::OracleSettled` },        limit: 20, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::Supplied` },            limit: 20, order: 'descending' }),
    ]);
    const inWindow = (ev) => Number(ev.timestampMs) >= since;
    const mintsW   = mints.data.filter(inWindow);
    const redeemsW = redeems.data.filter(inWindow);
    const settlesW = settles.data.filter(inWindow);
    const suppliedW = supplied.data.filter(inWindow);
    const sum = (arr, k) => arr.reduce((s, ev) => s + Number(ev.parsedJson?.[k] || 0), 0);
    const biggestRedeem = redeemsW.reduce((best, ev) => {
      const p = Number(ev.parsedJson?.payout || 0);
      return p > (best?.payout || 0) ? { payout: p, ev: ev.parsedJson } : best;
    }, null);
    const out = {
      ts: Date.now(),
      window_h: 24,
      mints:    mintsW.length,
      redeems:  redeemsW.length,
      settled:  settlesW.length,
      supplied: suppliedW.length,
      mint_volume_dusdc:    sum(mintsW,   'cost')    / 1e6,
      payout_volume_dusdc:  sum(redeemsW, 'payout')  / 1e6,
      supplied_volume_dusdc: sum(suppliedW, 'amount') / 1e6,
      biggest_payout: biggestRedeem ? {
        payout_dusdc: biggestRedeem.payout / 1e6,
        side: biggestRedeem.ev?.is_up ? 'CALL' : 'PUT',
        strike: Number(biggestRedeem.ev?.strike || 0) / 1e9,
      } : null,
    };
    statsCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Spread series for the vol-arb chart. Pulls recent quotes from sqlite (bot's loop already writes).
app.get('/api/spread', (req, res) => {
  const quotes = recentQuotes(parseInt(req.query.limit, 10) || 200);
  res.json({ quotes });
});

// Bot health snapshot.
import { existsSync } from 'node:fs';
app.get('/api/health', (req, res) => {
  const last = recentQuotes(1)[0];
  const killFile = process.env.KILL_FILE || '/tmp/predict-vol-arb.kill';
  res.json({
    dry_run: process.env.DRY_RUN !== 'false',
    kill_switch_active: existsSync(killFile),
    min_edge_vol: parseFloat(process.env.MIN_EDGE_VOL || '0.04'),
    bankroll_usdc: parseFloat(process.env.BANKROLL_USDC || '1000'),
    max_daily_loss_usdc: parseFloat(process.env.MAX_DAILY_LOSS_USDC || '200'),
    poll_ms: parseInt(process.env.POLL_MS || '15000', 10),
    last_poll_ts: last?.ts ?? null,
    last_poll_age_s: last ? Math.floor((Date.now() - last.ts) / 1000) : null,
    last_predict_iv: last?.predictIv ?? null,
    last_poly_iv: last?.polyIv ?? null,
    polymarket_alive: !!last?.polyIv,
    rpc: process.env.SUI_RPC || 'fullnode.testnet.sui.io',
    predict_pkg: (process.env.PREDICT_PKG || '').slice(0, 16) + '...',
    version: 'v1',
  });
});

// On-chain Predict vault state. 30s cache.
let vaultCache = { data: null, ts: 0 };
app.get('/api/vault', async (req, res) => {
  try {
    if (Date.now() - vaultCache.ts < 30_000 && vaultCache.data) return res.json({ ...vaultCache.data, cache: 'hit' });
    const obj = process.env.PREDICT_OBJECT;
    if (!obj) throw new Error('PREDICT_OBJECT not set');
    const r = await sui.getObject({ id: obj, options: { showContent: true, showType: true } });
    const f = r.data?.content?.fields ?? {};
    const pricing = f.pricing_config?.fields ?? {};
    const risk = f.risk_config?.fields ?? {};
    const wlim = f.withdrawal_limiter?.fields ?? {};
    const vault = f.vault?.fields ?? {};
    const tcap = f.treasury_cap?.fields ?? {};
    const acceptedTypes = (f.treasury_config?.fields?.accepted_quotes?.fields?.contents ?? []).map((t) => {
      const s = t.fields?.name || JSON.stringify(t);
      return s.replace(/^.*::/, '');
    });
    const out = {
      ts: Date.now(),
      trading_paused: !!f.trading_paused,
      vault_balance_dusdc: Number(vault.balance ?? 0) / 1e6,
      plp_supply: Number(tcap.total_supply?.fields?.value ?? tcap.total_supply ?? 0) / 1e6,
      base_spread_bps: Number(pricing.base_spread ?? 0) / 1e9 * 10000,
      min_ask_price: Number(pricing.min_ask_price ?? 0) / 1e9,
      max_ask_price: Number(pricing.max_ask_price ?? 0) / 1e9,
      max_total_exposure_pct: Number(risk.max_total_exposure_pct ?? 0) / 1e9 * 100,
      withdrawal_limiter: {
        enabled: !!wlim.enabled,
        available: Number(wlim.available ?? 0) / 1e6,
        capacity: Number(wlim.capacity ?? 0) / 1e6,
      },
      accepted_quotes: acceptedTypes,
    };
    vaultCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Per-oracle drill-down: recent SVI history + price history + settlement state.
app.get('/api/oracle/:id', async (req, res) => {
  try {
    const oid = req.params.id;
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const [sviRaw, priceRaw, obj] = await Promise.all([
      sui.queryEvents({ query: { MoveEventType: `${PKG}::oracle::OracleSVIUpdated` },     limit: 30, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::oracle::OraclePricesUpdated` }, limit: 30, order: 'descending' }),
      sui.getObject({ id: oid, options: { showContent: true } }),
    ]);
    const decodeI64 = (v) => v == null ? 0 : (typeof v === 'object' ? (Number(v.magnitude) * (v.is_negative ? -1 : 1)) : Number(v));
    const sviHistory = sviRaw.data
      .filter((e) => e.parsedJson?.oracle_id === oid)
      .map((e) => {
        const p = e.parsedJson;
        return {
          ts: Number(e.timestampMs),
          a: Number(p.a) / 1e9, b: Number(p.b) / 1e9,
          rho: decodeI64(p.rho) / 1e9, m: decodeI64(p.m) / 1e9,
          sigma: Number(p.sigma) / 1e9,
        };
      });
    const priceHistory = priceRaw.data
      .filter((e) => e.parsedJson?.oracle_id === oid)
      .map((e) => ({ ts: Number(e.timestampMs), spot: Number(e.parsedJson.spot) / 1e9, forward: Number(e.parsedJson.forward) / 1e9 }));
    const fields = obj.data?.content?.fields ?? {};
    res.json({
      oracleId: oid,
      type: obj.data?.type,
      expiry_ms: Number(fields.expiry ?? fields.expiry_ms ?? 0),
      is_settled: !!fields.is_settled,
      settlement_price: fields.settlement_price ? Number(fields.settlement_price) / 1e9 : null,
      svi_updates: sviHistory.length,
      price_updates: priceHistory.length,
      sviHistory,
      priceHistory,
    });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Live arb opportunities (computed on the fly from latest spread + edge threshold).
app.get('/api/opportunities', (req, res) => {
  const minEdge = parseFloat(req.query.minEdge || process.env.MIN_EDGE_VOL || '0.04');
  const recent = recentQuotes(60);
  const out = [];
  for (const q of recent.slice(-20).reverse()) {
    if (!Number.isFinite(q.predictIv) || !Number.isFinite(q.polyIv) || !q.polyIv) continue;
    const edge = q.polyIv - q.predictIv;
    if (Math.abs(edge) < minEdge) continue;
    out.push({
      ts: q.ts,
      predictIv: q.predictIv,
      polyIv: q.polyIv,
      edge: Math.abs(edge),
      side: edge > 0 ? 'buyPredict' : 'sellPredict',
      kelly: Math.max(0, Math.min(0.05, Math.abs(edge) * 2)),
    });
  }
  res.json({ minEdge, opportunities: out, sampledOver: recent.length });
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
