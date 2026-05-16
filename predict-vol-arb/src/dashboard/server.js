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

// Webhook proxy - frontend POSTs the URL + payload, server forwards. Avoids browser CORS to Slack/Discord.
app.use(express.json({ limit: '64kb' }));
app.post('/api/webhook', async (req, res) => {
  try {
    const { url, text } = req.body || {};
    if (!url || typeof url !== 'string') throw new Error('url required');
    if (!/^https:\/\/(hooks\.slack\.com|discord(app)?\.com|discord\.com)/i.test(url)) {
      throw new Error('only slack and discord webhooks accepted');
    }
    const isSlack = /hooks\.slack\.com/.test(url);
    const body = isSlack ? { text } : { content: text };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    res.json({ ok: r.ok, status: r.status });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Real on-chain order book for an oracle - calls predict::get_trade_amounts via devInspect for many strikes.
import { Transaction } from '@mysten/sui/transactions';
const DUSDC_TYPE = process.env.DUSDC_TYPE;
let orderbookCache = new Map();
app.get('/api/orderbook/:oracleId', async (req, res) => {
  try {
    const oid = req.params.oracleId;
    const cached = orderbookCache.get(oid);
    if (cached && Date.now() - cached.ts < 20_000) return res.json({ ...cached.data, cache: 'hit' });
    if (!PKG || !process.env.PREDICT_OBJECT) throw new Error('PREDICT_OBJECT or PREDICT_PKG not set');

    // Read forward + expiry
    const obj = await sui.getObject({ id: oid, options: { showContent: true } });
    const f = obj.data?.content?.fields ?? {};
    const expiry = Number(f.expiry ?? f.expiry_ms ?? 0);
    if (!expiry) throw new Error('no expiry on oracle');
    // Use a recent OraclePricesUpdated to get forward
    const priceEvs = await sui.queryEvents({ query: { MoveEventType: `${PKG}::oracle::OraclePricesUpdated` }, limit: 30, order: 'descending' });
    const lastPrice = priceEvs.data.find((e) => e.parsedJson?.oracle_id === oid)?.parsedJson;
    const forward = lastPrice ? Number(lastPrice.forward) / 1e9 : 79000;
    const F_raw = Math.round(forward * 1e9);

    // Build strikes: -8% to +8% in 1% steps = 17 strikes
    const strikes = [];
    for (let pct = -8; pct <= 8; pct += 1) strikes.push(Math.round(forward * (1 + pct / 100)));
    const quantity = 1_000_000; // $1 of binary

    // One PTB with all view calls in batch (cheaper roundtrip)
    const tx = new Transaction();
    for (const s of strikes) {
      const sRaw = BigInt(Math.round(s * 1e9));
      // CALL price
      const keyCall = tx.moveCall({ target: `${PKG}::market_key::up`,   arguments: [tx.pure.id(oid), tx.pure.u64(BigInt(expiry)), tx.pure.u64(sRaw)] });
      tx.moveCall({ target: `${PKG}::predict::get_trade_amounts`, arguments: [tx.object(process.env.PREDICT_OBJECT), tx.object(oid), keyCall, tx.pure.u64(BigInt(quantity)), tx.object('0x6')] });
      // PUT price
      const keyPut = tx.moveCall({ target: `${PKG}::market_key::down`, arguments: [tx.pure.id(oid), tx.pure.u64(BigInt(expiry)), tx.pure.u64(sRaw)] });
      tx.moveCall({ target: `${PKG}::predict::get_trade_amounts`, arguments: [tx.object(process.env.PREDICT_OBJECT), tx.object(oid), keyPut, tx.pure.u64(BigInt(quantity)), tx.object('0x6')] });
    }
    const r = await sui.devInspectTransactionBlock({ sender: '0x0000000000000000000000000000000000000000000000000000000000000000', transactionBlock: tx });

    const decodeU64 = (bytes) => {
      // little-endian u64
      let n = 0n;
      for (let i = 0; i < 8 && i < bytes.length; i++) n |= BigInt(bytes[i]) << BigInt(8 * i);
      return Number(n);
    };

    const rows = strikes.map((strike, i) => {
      const callRes = r.results?.[i * 4 + 1]?.returnValues; // get_trade_amounts returns (cost, payout)
      const putRes  = r.results?.[i * 4 + 3]?.returnValues;
      const callAsk = callRes?.[0]?.[0] ? decodeU64(callRes[0][0]) / quantity : null;
      const callBid = callRes?.[1]?.[0] ? decodeU64(callRes[1][0]) / quantity : null;
      const putAsk  = putRes?.[0]?.[0]  ? decodeU64(putRes[0][0])  / quantity : null;
      const putBid  = putRes?.[1]?.[0]  ? decodeU64(putRes[1][0])  / quantity : null;
      return { strike, callAsk, callBid, putAsk, putBid };
    });

    const out = { ts: Date.now(), oracleId: oid, forward, expiry, rows };
    orderbookCache.set(oid, { ts: Date.now(), data: out });
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Per-strike trade flow over last 24h (from PositionMinted events for an oracle).
let flowCache = new Map();
app.get('/api/strike-flow/:oracleId', async (req, res) => {
  try {
    const oid = req.params.oracleId;
    const cached = flowCache.get(oid);
    if (cached && Date.now() - cached.ts < 30_000) return res.json({ ...cached.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const since = Date.now() - 24 * 3600_000;
    const evs = await sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionMinted` }, limit: 50, order: 'descending' });
    const events = evs.data
      .filter((e) => e.parsedJson?.oracle_id === oid && Number(e.timestampMs) >= since)
      .map((e) => ({
        ts: Number(e.timestampMs),
        strike: Number(e.parsedJson.strike) / 1e9,
        is_up: !!e.parsedJson.is_up,
        quantity: Number(e.parsedJson.quantity),
        cost: Number(e.parsedJson.cost) / 1e6,
      }));
    const buckets = new Map();
    for (const ev of events) {
      const key = Math.round(ev.strike / 1000) * 1000;
      const cur = buckets.get(key) || { strike: key, calls: 0, puts: 0, callVol: 0, putVol: 0 };
      if (ev.is_up) { cur.calls += 1; cur.callVol += ev.cost; } else { cur.puts += 1; cur.putVol += ev.cost; }
      buckets.set(key, cur);
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => a.strike - b.strike);
    const out = { ts: Date.now(), oracleId: oid, eventCount: events.length, buckets: sorted, events: events.slice(-30) };
    flowCache.set(oid, { ts: Date.now(), data: out });
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Hour-of-day activity heatmap from on-chain events.
let hourCache = { data: null, ts: 0 };
app.get('/api/hour-activity', async (req, res) => {
  try {
    if (Date.now() - hourCache.ts < 120_000 && hourCache.data) return res.json({ ...hourCache.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const since = Date.now() - 7 * 24 * 3600_000;
    const evs = await sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionMinted` }, limit: 50, order: 'descending' });
    const cells = Array.from({ length: 7 * 24 }, (_, i) => ({ dow: Math.floor(i / 24), hour: i % 24, mints: 0, vol: 0 }));
    for (const e of evs.data) {
      const t = Number(e.timestampMs);
      if (t < since) continue;
      const d = new Date(t);
      const idx = d.getUTCDay() * 24 + d.getUTCHours();
      cells[idx].mints += 1;
      cells[idx].vol += Number(e.parsedJson?.cost || 0) / 1e6;
    }
    const out = { ts: Date.now(), windowDays: 7, cells };
    hourCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Realized vol for a given oracle, computed from OraclePricesUpdated events.
let realizedCache = new Map();
app.get('/api/realized/:oracleId', async (req, res) => {
  try {
    const oid = req.params.oracleId;
    const cached = realizedCache.get(oid);
    if (cached && Date.now() - cached.ts < 60_000) return res.json({ ...cached.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const evs = await sui.queryEvents({
      query: { MoveEventType: `${PKG}::oracle::OraclePricesUpdated` },
      limit: 200, order: 'descending',
    });
    const ts = evs.data
      .filter((e) => e.parsedJson?.oracle_id === oid)
      .map((e) => ({ ts: Number(e.timestampMs), spot: Number(e.parsedJson.spot) / 1e9 }))
      .filter((p) => p.spot > 0)
      .sort((a, b) => a.ts - b.ts);

    function realizedVolForWindowMs(windowMs) {
      const sample = ts.filter((p) => p.ts >= Date.now() - windowMs);
      if (sample.length < 3) return null;
      const rets = [];
      for (let i = 1; i < sample.length; i++) {
        const r = Math.log(sample[i].spot / sample[i - 1].spot);
        const dt = (sample[i].ts - sample[i - 1].ts) / 1000;
        if (dt > 0) rets.push({ r, dt });
      }
      if (!rets.length) return null;
      // annualised volatility = sqrt(sum(r^2 / dt) / N) * sqrt(seconds-per-year)
      const meanR = rets.reduce((s, x) => s + x.r, 0) / rets.length;
      const varR = rets.reduce((s, x) => s + (x.r - meanR) ** 2, 0) / rets.length;
      const meanDt = rets.reduce((s, x) => s + x.dt, 0) / rets.length;
      return Math.sqrt(varR / meanDt) * Math.sqrt(365 * 86400);
    }

    const out = {
      ts: Date.now(),
      oracleId: oid,
      sampleCount: ts.length,
      windows: {
        '5m':  realizedVolForWindowMs(5 * 60_000),
        '30m': realizedVolForWindowMs(30 * 60_000),
        '1h':  realizedVolForWindowMs(60 * 60_000),
        '6h':  realizedVolForWindowMs(6 * 60 * 60_000),
        '24h': realizedVolForWindowMs(24 * 60 * 60_000),
      },
      points: ts.slice(-50),
    };
    realizedCache.set(oid, { ts: Date.now(), data: out });
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Per-manager equity curve from mint + redeem events.
let mgrPnlCache = new Map();
app.get('/api/manager/:id/pnl', async (req, res) => {
  try {
    const mgrId = req.params.id;
    const cached = mgrPnlCache.get(mgrId);
    if (cached && Date.now() - cached.ts < 60_000) return res.json({ ...cached.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const [mints, redeems] = await Promise.all([
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionMinted` },   limit: 50, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionRedeemed` }, limit: 50, order: 'descending' }),
    ]);
    const events = [];
    for (const e of mints.data)   if (e.parsedJson?.manager_id === mgrId) events.push({ ts: Number(e.timestampMs), kind: 'mint',   delta: -Number(e.parsedJson.cost   || 0) / 1e6 });
    for (const e of redeems.data) if (e.parsedJson?.manager_id === mgrId) events.push({ ts: Number(e.timestampMs), kind: 'redeem', delta: +Number(e.parsedJson.payout || 0) / 1e6 });
    events.sort((a, b) => a.ts - b.ts);
    let pnl = 0;
    const series = events.map((e) => { pnl += e.delta; return { ts: e.ts, kind: e.kind, delta: e.delta, pnl }; });
    const out = { ts: Date.now(), managerId: mgrId, points: series.length, finalPnl: pnl, series };
    mgrPnlCache.set(mgrId, { ts: Date.now(), data: out });
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Wallet lookup: get PredictManager(s) for a Sui address + summary.
let positionsCache = new Map();
app.get('/api/positions/:owner', async (req, res) => {
  try {
    const owner = req.params.owner;
    if (!owner.startsWith('0x') || owner.length < 40) throw new Error('invalid sui address');
    const cached = positionsCache.get(owner);
    if (cached && Date.now() - cached.ts < 30_000) return res.json({ ...cached.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');

    const evs = await sui.queryEvents({
      query: { MoveEventType: `${PKG}::predict_manager::PredictManagerCreated` },
      limit: 200, order: 'descending',
    });
    const managers = evs.data
      .filter((e) => String(e.parsedJson?.owner) === owner)
      .map((e) => ({ id: e.parsedJson?.manager_id, createdMs: Number(e.timestampMs), tx: e.id?.txDigest }));

    const enriched = await Promise.all(managers.slice(0, 10).map(async (m) => {
      try {
        const o = await sui.getObject({ id: m.id, options: { showContent: true } });
        const f = o.data?.content?.fields ?? {};
        const bm = f.balance_manager?.fields ?? {};
        return { ...m, owner: f.owner, balance_manager_id: bm.id?.id ?? null };
      } catch { return m; }
    }));

    const out = { ts: Date.now(), owner, managerCount: managers.length, managers: enriched };
    positionsCache.set(owner, { ts: Date.now(), data: out });
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
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

// 24h leaderboard - top managers by sum of redeemed payouts.
let lbCache = { data: null, ts: 0 };
app.get('/api/leaderboard', async (req, res) => {
  try {
    if (Date.now() - lbCache.ts < 60_000 && lbCache.data) return res.json({ ...lbCache.data, cache: 'hit' });
    if (!PKG) throw new Error('PREDICT_PKG not set');
    const since = Date.now() - 24 * 3600_000;
    const [redeems, mints] = await Promise.all([
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionRedeemed` }, limit: 50, order: 'descending' }),
      sui.queryEvents({ query: { MoveEventType: `${PKG}::predict::PositionMinted` },   limit: 50, order: 'descending' }),
    ]);
    const inWindow = (ev) => Number(ev.timestampMs) >= since;
    const byMgr = new Map();
    for (const ev of redeems.data.filter(inWindow)) {
      const mgr = ev.parsedJson?.manager_id;
      if (!mgr) continue;
      const e = byMgr.get(mgr) || { manager: mgr, payout: 0, wins: 0, mints: 0, cost: 0 };
      e.payout += Number(ev.parsedJson?.payout || 0) / 1e6;
      e.wins  += 1;
      byMgr.set(mgr, e);
    }
    for (const ev of mints.data.filter(inWindow)) {
      const mgr = ev.parsedJson?.manager_id;
      if (!mgr) continue;
      const e = byMgr.get(mgr) || { manager: mgr, payout: 0, wins: 0, mints: 0, cost: 0 };
      e.cost  += Number(ev.parsedJson?.cost   || 0) / 1e6;
      e.mints += 1;
      byMgr.set(mgr, e);
    }
    const ranked = Array.from(byMgr.values()).map((e) => ({
      ...e, net: e.payout - e.cost,
    })).sort((a, b) => b.payout - a.payout).slice(0, 12);
    const out = { ts: Date.now(), traders: ranked.length, top: ranked };
    lbCache = { data: out, ts: Date.now() };
    res.json({ ...out, cache: 'miss' });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// Backtest: simulate "trade every spread that exceeds edge threshold for N seconds, take PnL when revert toward predict".
app.get('/api/backtest', (req, res) => {
  const minEdge = parseFloat(req.query.minEdge || process.env.MIN_EDGE_VOL || '0.04');
  const sizePerTrade = parseFloat(req.query.size || '100');
  const quotes = recentQuotes(2000);
  let pnl = 0; let trades = 0; let wins = 0;
  let openSide = null; let openIv = null; let openIdx = -1;
  const series = [];
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    if (!Number.isFinite(q.predictIv) || !Number.isFinite(q.polyIv) || !q.polyIv) {
      series.push({ ts: q.ts, pnl });
      continue;
    }
    const edge = q.polyIv - q.predictIv;
    if (openSide === null && Math.abs(edge) >= minEdge) {
      openSide = edge > 0 ? 'buy' : 'sell';
      openIv = q.predictIv;
      openIdx = i;
    } else if (openSide !== null) {
      const moved = q.predictIv - openIv;
      const pnlSign = openSide === 'buy' ? 1 : -1;
      const tradePnl = pnlSign * moved * sizePerTrade * 100;
      // Close after 4 ticks or when edge inverts
      const ticksHeld = i - openIdx;
      const newEdge = q.polyIv - q.predictIv;
      const inverted = (openSide === 'buy' && newEdge < 0) || (openSide === 'sell' && newEdge > 0);
      if (ticksHeld >= 4 || inverted) {
        pnl += tradePnl; trades += 1; if (tradePnl > 0) wins += 1;
        openSide = null; openIv = null; openIdx = -1;
      }
    }
    series.push({ ts: q.ts, pnl });
  }
  res.json({ minEdge, sizePerTrade, trades, wins, finalPnl: pnl, hitRate: trades ? wins / trades : 0, series });
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
