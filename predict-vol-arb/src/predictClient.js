import axios from 'axios';
import { iv as sviIv } from './sviMath.js';

const BASE = process.env.PREDICT_SERVER || 'https://predict-server.testnet.mystenlabs.com';

export async function fetchPredictSurface({ symbol = 'BTC' } = {}) {
  const r = await axios.get(`${BASE}/api/oracles/svi`, { params: { symbol, limit: 1 } });
  const snap = r.data?.snapshots?.[0];
  if (!snap) throw new Error('no predict snapshot');
  const T = Math.max(snap.expirySec - Date.now() / 1000, 60) / (365 * 86400);
  return {
    symbol,
    forward: Number(snap.forward),
    expirySec: Number(snap.expirySec),
    svi: snap.svi,
    atmIv: sviIv(snap.svi, 0, T),
    smile: (k) => sviIv(snap.svi, k, T),
    raw: snap,
  };
}
