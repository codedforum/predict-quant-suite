import { SviParams, SviSliceMeta } from './sviMath';

const DEFAULT_BASE = (import.meta as any).env?.VITE_PREDICT_SERVER ?? 'https://predict-server.testnet.mystenlabs.com';
const FLOAT_SCALING = 1e9;

export interface SviSnapshot {
  oracleId: string;
  timestampMs: number;
  forward: number;
  expirySec: number;
  svi: SviParams;
  allSlices?: SviSliceMeta[];
}

interface I64Json { magnitude: string | number; is_negative: boolean }

function decodeI64(v: I64Json | number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  const mag = Number((v as I64Json).magnitude ?? 0);
  return (v as I64Json).is_negative ? -mag : mag;
}

export async function fetchLatestSviSnapshots(base = DEFAULT_BASE): Promise<SviSnapshot[]> {
  try {
    const r = await fetch(`${base}/api/oracles/svi?limit=120`);
    if (!r.ok) throw new Error(`predict-server ${r.status}`);
    const j = await r.json();
    const arr = j.snapshots ?? j ?? [];
    return arr.map(normalize);
  } catch (e) {
    console.warn('falling back to mock surface', e);
    return mockSeries();
  }
}

function normalize(raw: any): SviSnapshot {
  const svi = raw.svi ?? raw;
  return {
    oracleId: String(raw.oracle_id ?? raw.oracleId ?? ''),
    timestampMs: Number(raw.timestamp ?? raw.timestampMs ?? raw.ts ?? Date.now()),
    forward: Number(raw.forward ?? raw.forward_price ?? 0) / FLOAT_SCALING,
    expirySec: Number(raw.expiry ?? raw.expirySec ?? 0),
    svi: {
      a: Number(svi.a ?? 0.04 * FLOAT_SCALING) / FLOAT_SCALING,
      b: Number(svi.b ?? 0.4 * FLOAT_SCALING) / FLOAT_SCALING,
      rho: decodeI64(svi.rho) / FLOAT_SCALING,
      m: decodeI64(svi.m) / FLOAT_SCALING,
      sigma: Number(svi.sigma ?? 0.2 * FLOAT_SCALING) / FLOAT_SCALING,
    },
  };
}

function mockSeries(): SviSnapshot[] {
  const now = Date.now();
  return Array.from({ length: 60 }, (_, i) => ({
    oracleId: '0xMOCK',
    timestampMs: now - (60 - i) * 60_000,
    forward: 70_000 + Math.sin(i / 4) * 800,
    expirySec: Math.floor(now / 1000) + 3600,
    svi: {
      a: 0.03 + 0.005 * Math.sin(i / 6),
      b: 0.35 + 0.03 * Math.cos(i / 5),
      rho: -0.25 + 0.05 * Math.sin(i / 7),
      m: 0.01 * Math.sin(i / 3),
      sigma: 0.18 + 0.02 * Math.cos(i / 4),
    },
  }));
}
