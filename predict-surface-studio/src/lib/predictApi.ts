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

export async function fetchSurface(): Promise<SurfaceResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/api/surface`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    const j = await r.json();
    return j;
  } catch (e) {
    console.error('fetchSurface failed', e);
    return null;
  }
}

// Build a synthetic snapshot list across the available oracles so the
// time-travel slider has something to scrub through immediately.
export function snapshotsFromSurface(s: SurfaceResponse): SviSnapshot[] {
  const snaps: SviSnapshot[] = [];
  for (const o of s.oracles) {
    snaps.push({
      oracleId: o.oracleId,
      timestampMs: o.lastUpdateMs,
      forward: s.primary.forward,
      expirySec: s.primary.expirySec,
      svi: o.svi,
    });
  }
  return snaps.length ? snaps : [s.primary];
}
