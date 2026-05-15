// Returns a list of arb opportunities where Predict and Polymarket disagree
// on implied vol by more than `minEdge`. Side = "buyPredict" if Predict IV
// is cheap relative to Polymarket, else "sellPredict".
export function findArb({ predict, poly, minEdge = 0.04 }) {
  const out = [];
  if (!Number.isFinite(predict.atmIv) || !Number.isFinite(poly.atmIv)) return out;
  const edge = poly.atmIv - predict.atmIv;
  if (Math.abs(edge) < minEdge) return out;

  out.push({
    expiry: predict.expirySec,
    strike: predict.forward,
    side: edge > 0 ? 'buyPredict' : 'sellPredict',
    predictIv: predict.atmIv,
    polyIv: poly.atmIv,
    edge: Math.abs(edge),
    confidence: Math.min(1, Math.abs(edge) / 0.2),
  });
  return out;
}
