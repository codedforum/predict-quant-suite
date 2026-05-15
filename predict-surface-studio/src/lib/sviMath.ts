export interface SviParams {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

export interface SviSliceMeta {
  expiryMs: number;
  forward: number;
  svi: SviParams;
}

// Gatheral raw SVI: w(k) = a + b * (rho*(k - m) + sqrt((k - m)^2 + sigma^2))
// k = log-moneyness = ln(K / F).  IV = sqrt(w / T).
export function totalVariance(p: SviParams, k: number): number {
  const dx = k - p.m;
  return p.a + p.b * (p.rho * dx + Math.sqrt(dx * dx + p.sigma * p.sigma));
}

export function iv(p: SviParams, k: number, T: number): number {
  const w = totalVariance(p, k);
  if (w <= 0 || T <= 0) return 0;
  return Math.sqrt(w / T);
}

// Butterfly arb-free check: g(k) >= 0  where
// g(k) = (1 - k * w'(k) / (2*w))^2 - (w'(k))^2 / 4 * (1/w + 1/4) + w''(k) / 2
// Numeric check across a strike grid.
export function butterflyOk(p: SviParams, kMin = -1.5, kMax = 1.5, n = 121): boolean {
  const h = (kMax - kMin) / (n - 1);
  for (let i = 1; i < n - 1; i++) {
    const k = kMin + i * h;
    const w = totalVariance(p, k);
    if (w <= 0) return false;
    const wPrev = totalVariance(p, k - h);
    const wNext = totalVariance(p, k + h);
    const wPrime = (wNext - wPrev) / (2 * h);
    const wPP = (wNext - 2 * w + wPrev) / (h * h);
    const term1 = (1 - (k * wPrime) / (2 * w)) ** 2;
    const term2 = (wPrime * wPrime) / 4 * (1 / w + 0.25);
    const g = term1 - term2 + wPP / 2;
    if (g < -1e-6) return false;
  }
  return true;
}

// Calendar arb-free check: w_T2(k) >= w_T1(k) for all k when T2 > T1.
export function calendarOk(slices: SviSliceMeta[]): boolean {
  const sorted = [...slices].sort((a, b) => a.expiryMs - b.expiryMs);
  for (let i = 1; i < sorted.length; i++) {
    for (let k = -1.5; k <= 1.5; k += 0.05) {
      if (totalVariance(sorted[i].svi, k) + 1e-8 < totalVariance(sorted[i - 1].svi, k)) return false;
    }
  }
  return true;
}

export interface ArbResult { ok: boolean; violations: string[] }
export function checkArbFree(snap: { svi: SviParams; allSlices?: SviSliceMeta[] }): ArbResult {
  const violations: string[] = [];
  if (!butterflyOk(snap.svi)) violations.push('butterfly');
  if (snap.allSlices && !calendarOk(snap.allSlices)) violations.push('calendar');
  return { ok: violations.length === 0, violations };
}
