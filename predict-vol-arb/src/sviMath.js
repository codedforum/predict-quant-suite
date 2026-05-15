// Same Gatheral raw SVI as the surface studio - kept in JS for the bot runtime.
export function totalVariance(p, k) {
  const dx = k - p.m;
  return p.a + p.b * (p.rho * dx + Math.sqrt(dx * dx + p.sigma * p.sigma));
}

export function iv(p, k, T) {
  const w = totalVariance(p, k);
  return w > 0 && T > 0 ? Math.sqrt(w / T) : 0;
}
