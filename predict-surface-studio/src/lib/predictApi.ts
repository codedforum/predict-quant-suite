import { SviParams, SviSliceMeta } from './sviMath';

const DEFAULT_BASE = (import.meta as any).env?.VITE_PREDICT_SERVER ?? 'https://predict-server.testnet.mystenlabs.com';

export interface SviSnapshot {
  oracleId: string;
  timestampMs: number;
  forward: number;
  svi: SviParams;
  allSlices?: SviSliceMeta[];
}

// Real endpoint shape pending - confirm in DeepBook builder TG.
// Treat any failure as "show empty surface" so the UI still loads.
export async function fetchLatestSviSnapshots(base = DEFAULT_BASE): Promise<SviSnapshot[]> {
  try {
    const r = await fetch(`${base}/api/oracles/svi?limit=120`);
    if (!r.ok) throw new Error(`predict-server ${r.status}`);
    const j = await r.json();
    return (j.snapshots ?? []).map(normalize);
  } catch (e) {
    console.warn('falling back to mock surface', e);
    return mockSeries();
  }
}

function normalize(raw: any): SviSnapshot {
  return {
    oracleId: String(raw.oracleId ?? raw.oracle_id ?? ''),
    timestampMs: Number(raw.timestampMs ?? raw.ts ?? Date.now()),
    forward: Number(raw.forward ?? raw.fwd ?? 0),
    svi: {
      a: Number(raw.svi?.a ?? 0.04),
      b: Number(raw.svi?.b ?? 0.4),
      rho: Number(raw.svi?.rho ?? -0.3),
      m: Number(raw.svi?.m ?? 0),
      sigma: Number(raw.svi?.sigma ?? 0.2),
    },
  };
}

function mockSeries(): SviSnapshot[] {
  const now = Date.now();
  return Array.from({ length: 60 }, (_, i) => ({
    oracleId: '0xMOCK',
    timestampMs: now - (60 - i) * 60_000,
    forward: 70_000 + Math.sin(i / 4) * 800,
    svi: {
      a: 0.03 + 0.005 * Math.sin(i / 6),
      b: 0.35 + 0.03 * Math.cos(i / 5),
      rho: -0.25 + 0.05 * Math.sin(i / 7),
      m: 0.01 * Math.sin(i / 3),
      sigma: 0.18 + 0.02 * Math.cos(i / 4),
    },
  }));
}
