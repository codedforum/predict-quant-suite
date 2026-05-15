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
