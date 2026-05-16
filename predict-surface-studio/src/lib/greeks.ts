// Black-Scholes digital greeks. Returns delta/gamma/vega per binary contract paying $1.
import { iv, SviParams } from './sviMath';

function normPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

export type Metric = 'iv' | 'delta' | 'vega' | 'gamma';

export const METRIC_LABELS: Record<Metric, string> = {
  iv: 'Implied Vol',
  delta: 'Δ Delta',
  vega: 'ν Vega',
  gamma: 'Γ Gamma',
};

export function metricAt(svi: SviParams, k: number, T: number, metric: Metric, F: number = 1): number {
  const sigma = iv(svi, k, T);
  if (metric === 'iv') return sigma;
  if (sigma <= 0 || T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d2 = (-k - 0.5 * sigma * sigma * T) / Math.max(sigma * sqrtT, 1e-9);
  const d1 = d2 + sigma * sqrtT;
  const pdf = normPdf(d2);
  if (metric === 'delta') return pdf / Math.max(F * sigma * sqrtT, 1e-9);
  if (metric === 'vega')  return -d1 * pdf / Math.max(sigma, 1e-9);
  if (metric === 'gamma') return -d1 * pdf / Math.max(F * F * sigma * sigma * T, 1e-9);
  return 0;
}
