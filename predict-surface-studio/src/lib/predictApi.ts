import { SviParams } from './sviMath';

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'https://predict-api.smartcodedbot.com';

export interface SviSnapshot {
  oracleId: string;
  timestampMs: number;
  forward: number;
  expirySec: number;
  svi: SviParams;
  source?: string;
}

export interface SurfaceResponse {
  primary: SviSnapshot;
  oracles: { oracleId: string; lastUpdateMs: number; svi: SviParams }[];
  ts: number;
  source: string;
  cache: 'hit' | 'miss';
}

export interface ActivityEvent {
  kind: string;
  timestampMs: number;
  txDigest: string;
  summary: string;
}

export async function fetchSurface(): Promise<SurfaceResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/api/surface`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error('fetchSurface failed', e);
    return null;
  }
}

export interface Stats {
  window_h: number;
  mints: number;
  redeems: number;
  settled: number;
  supplied: number;
  mint_volume_dusdc: number;
  payout_volume_dusdc: number;
  supplied_volume_dusdc: number;
  biggest_payout: { payout_dusdc: number; side: string; strike: number } | null;
}
export async function fetchStats(): Promise<Stats | null> {
  try {
    const r = await fetch(`${API_BASE}/api/stats`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    return await r.json();
  } catch (e) { console.error('fetchStats failed', e); return null; }
}

export interface SpreadQuote { ts: number; predictIv: number; polyIv: number }

export interface Health {
  dry_run: boolean;
  kill_switch_active: boolean;
  min_edge_vol: number;
  bankroll_usdc: number;
  max_daily_loss_usdc: number;
  poll_ms: number;
  last_poll_ts: number | null;
  last_poll_age_s: number | null;
  last_predict_iv: number | null;
  last_poly_iv: number | null;
  polymarket_alive: boolean;
  rpc: string;
  predict_pkg: string;
  version: string;
}
export async function fetchHealth(): Promise<Health | null> {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface Vault {
  trading_paused: boolean;
  vault_balance_dusdc: number;
  plp_supply: number;
  base_spread_bps: number;
  min_ask_price: number;
  max_ask_price: number;
  max_total_exposure_pct: number;
  withdrawal_limiter: { enabled: boolean; available: number; capacity: number };
  accepted_quotes: string[];
}
export async function fetchVault(): Promise<Vault | null> {
  try {
    const r = await fetch(`${API_BASE}/api/vault`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface LeaderboardRow {
  manager: string; payout: number; wins: number; mints: number; cost: number; net: number;
}
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const r = await fetch(`${API_BASE}/api/leaderboard`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return j.top ?? [];
  } catch { return []; }
}

export interface BacktestPoint { ts: number; pnl: number }
export interface BacktestResult {
  minEdge: number; sizePerTrade: number; trades: number; wins: number;
  finalPnl: number; hitRate: number; series: BacktestPoint[];
}
export async function fetchBacktest(): Promise<BacktestResult | null> {
  try {
    const r = await fetch(`${API_BASE}/api/backtest`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface OrderbookRow { strike: number; callAsk: number | null; callBid: number | null; putAsk: number | null; putBid: number | null }
export interface Orderbook { oracleId: string; forward: number; expiry: number; rows: OrderbookRow[] }
export async function fetchOrderbook(oracleId: string): Promise<Orderbook | null> {
  try { const r = await fetch(`${API_BASE}/api/orderbook/${oracleId}`, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

export interface StrikeFlowBucket { strike: number; calls: number; puts: number; callVol: number; putVol: number }
export interface StrikeFlow { oracleId: string; eventCount: number; buckets: StrikeFlowBucket[]; events: { ts: number; strike: number; is_up: boolean; quantity: number; cost: number }[] }
export async function fetchStrikeFlow(oracleId: string): Promise<StrikeFlow | null> {
  try { const r = await fetch(`${API_BASE}/api/strike-flow/${oracleId}`, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

export interface HourActivity { windowDays: number; cells: { dow: number; hour: number; mints: number; vol: number }[] }
export async function fetchHourActivity(): Promise<HourActivity | null> {
  try { const r = await fetch(`${API_BASE}/api/hour-activity`, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

export interface RealizedVol {
  oracleId: string;
  sampleCount: number;
  windows: Record<string, number | null>;
  points: { ts: number; spot: number }[];
}
export async function fetchRealized(oracleId: string): Promise<RealizedVol | null> {
  try {
    const r = await fetch(`${API_BASE}/api/realized/${oracleId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface ManagerPnl {
  managerId: string;
  points: number;
  finalPnl: number;
  series: { ts: number; kind: 'mint' | 'redeem'; delta: number; pnl: number }[];
}
export async function fetchManagerPnl(id: string): Promise<ManagerPnl | null> {
  try {
    const r = await fetch(`${API_BASE}/api/manager/${id}/pnl`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface PositionsLookup {
  owner: string;
  managerCount: number;
  managers: { id: string; createdMs: number; tx?: string; owner?: string; balance_manager_id?: string }[];
}
export async function fetchPositions(owner: string): Promise<PositionsLookup | null> {
  try {
    const r = await fetch(`${API_BASE}/api/positions/${owner}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface OracleDrill {
  oracleId: string;
  expiry_ms: number;
  is_settled: boolean;
  settlement_price: number | null;
  sviHistory: { ts: number; a: number; b: number; rho: number; m: number; sigma: number }[];
  priceHistory: { ts: number; spot: number; forward: number }[];
}
export async function fetchOracleDrill(oracleId: string): Promise<OracleDrill | null> {
  try {
    const r = await fetch(`${API_BASE}/api/oracle/${oracleId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface ArbOpportunity {
  ts: number; predictIv: number; polyIv: number;
  edge: number; side: 'buyPredict' | 'sellPredict'; kelly: number;
}
export async function fetchOpportunities(): Promise<ArbOpportunity[]> {
  try {
    const r = await fetch(`${API_BASE}/api/opportunities`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return j.opportunities ?? [];
  } catch { return []; }
}
export async function fetchSpread(limit = 200): Promise<SpreadQuote[]> {
  try {
    const r = await fetch(`${API_BASE}/api/spread?limit=${limit}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    const j = await r.json();
    return j.quotes ?? [];
  } catch (e) { console.error('fetchSpread failed', e); return []; }
}

export async function fetchActivity(): Promise<ActivityEvent[]> {
  try {
    const r = await fetch(`${API_BASE}/api/activity`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    const j = await r.json();
    return j.events ?? [];
  } catch (e) {
    console.error('fetchActivity failed', e);
    return [];
  }
}

// Cross-feed (Deribit-primary, Polymarket fallback). Added 2026-05-16.
export interface CrossFeedSnapshot {
  atmIv: number;
  spot: number | null;
  expirySec?: number;
  expiryDriftSec?: number;
  expiryDriftDays?: number;
  source: 'deribit' | 'polymarket' | 'none';
  sourceLabel: string;
  instruments?: { name: string; strike: number; iv: number }[];
  symbol?: string;
  errors?: Record<string, string>;
}
export interface CrossFeedLogRow {
  ts: number;
  source: string;
  sourceLabel: string | null;
  iv: number | null;
  spot: number | null;
  expirySec: number | null;
  expiryDriftSec: number | null;
}
export interface CrossFeedResponse {
  ts: number;
  latest: CrossFeedSnapshot;
  recent: CrossFeedLogRow[];
  health24h: { source: string; count: number; pct: number }[];
}
export async function fetchCrossFeed(): Promise<CrossFeedResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/api/cross-feed`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    return await r.json();
  } catch (e) { console.error('fetchCrossFeed failed', e); return null; }
}

// Delta-hedge (Hyperliquid). Added 2026-05-16.
export interface HedgeBreakdown {
  positionId: number | null;
  kind: 'C' | 'P';
  side: 'long' | 'short';
  strike: number;
  sizeBtc: number;
  bsmDelta: number;
  contribBtc: number;
}
export interface HedgeSnapshot {
  enabled: boolean;
  live: boolean;
  ts: number;
  spot: number;
  positionsCount: number;
  portfolioDelta: number;
  hlCurrent: number;
  hedgeTarget: number;
  drift: number;
  rebalanceThreshold: number;
  action: null | {
    side: 'BUY' | 'SELL';
    sizeBtc: number;
    notionalUsd: number;
    atSpot: number;
  };
  breakdown: HedgeBreakdown[];
  error?: string;
}
export interface HedgeHistoryRow {
  ts: number;
  spot: number;
  portfolioDelta: number;
  hlCurrent: number;
  hedgeTarget: number;
  drift: number;
  actionSide: 'BUY' | 'SELL' | null;
  actionSize: number | null;
  live: boolean;
}
export interface OpenPosition {
  id: number;
  side: 'long' | 'short';
  kind: 'C' | 'P';
  strike: number;
  expirySec: number;
  sizeBtc: number;
  sigma: number;
  oracleId: string | null;
}
export interface HedgeResponse {
  ts: number;
  snapshot: HedgeSnapshot;
  openPositions: OpenPosition[];
  history: HedgeHistoryRow[];
}
export async function fetchHedge(): Promise<HedgeResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/api/hedge`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    return await r.json();
  } catch (e) { console.error('fetchHedge failed', e); return null; }
}

export function snapshotsFromSurface(s: SurfaceResponse): SviSnapshot[] {
  if (!s.oracles?.length) return [s.primary];
  return s.oracles.map((o) => ({
    oracleId: o.oracleId,
    timestampMs: o.lastUpdateMs,
    forward: s.primary.forward,
    expirySec: s.primary.expirySec,
    svi: o.svi,
  }));
}
