import axios from 'axios';

// Polymarket has a public CLOB API. For BTC binaries we read midpoint prices,
// invert to implied probabilities, then back-out implied vol assuming the same
// expiry as the Predict snapshot.
const CLOB = process.env.POLYMARKET_CLOB || 'https://clob.polymarket.com';

export async function fetchPolymarketSmile({ symbol = 'BTC' } = {}) {
  const r = await axios.get(`${CLOB}/markets?tag=${symbol}`);
  const markets = (r.data?.data ?? []).filter((m) => m.active && /BTC/i.test(m.question));
  const points = markets.map((m) => ({
    strike: extractStrike(m.question),
    expirySec: Date.parse(m.end_date_iso) / 1000,
    midProb: midProbFromTokens(m.tokens),
  })).filter((p) => Number.isFinite(p.strike) && Number.isFinite(p.midProb));

  if (!points.length) return { symbol, atmIv: NaN, smile: () => NaN, points: [] };
  const atm = points.sort((a, b) => Math.abs(a.midProb - 0.5) - Math.abs(b.midProb - 0.5))[0];
  return {
    symbol,
    atmIv: implyVolFromBinary(atm),
    smile: (k) => interpVol(points, k),
    points,
  };
}

function extractStrike(q) {
  const m = /\$?([\d,]+)k?/i.exec(q);
  if (!m) return NaN;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return /k\b/i.test(q) ? n * 1000 : n;
}

function midProbFromTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 2) return NaN;
  const yes = tokens.find((t) => /yes/i.test(t.outcome));
  return yes ? Number(yes.price) : NaN;
}

function implyVolFromBinary({ midProb, strike, expirySec }) {
  // invert N(d2) = midProb (assuming forward = strike for ATM)
  const T = Math.max(expirySec - Date.now() / 1000, 60) / (365 * 86400);
  if (!T) return NaN;
  const d2 = inverseNormalCdf(midProb);
  return Math.abs(d2) < 1e-6 ? 0.6 : Math.abs(d2) / Math.sqrt(T);
}

function interpVol(points, k) {
  // crude nearest-neighbor; replace with cubic spline for production
  if (!points.length) return NaN;
  return implyVolFromBinary(points[0]);
}

// Acklam approximation of the inverse normal CDF
function inverseNormalCdf(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= ph) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}
