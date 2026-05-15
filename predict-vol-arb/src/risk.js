import fs from 'node:fs';

const KILL_FILE = process.env.KILL_FILE || '/tmp/predict-vol-arb.kill';
const MAX_DAILY_LOSS = parseFloat(process.env.MAX_DAILY_LOSS_USDC || '200');

let dailyPnl = 0;
let dayKey = new Date().toISOString().slice(0, 10);

export function killSwitch() {
  if (fs.existsSync(KILL_FILE)) return true;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dailyPnl = 0; }
  return dailyPnl <= -MAX_DAILY_LOSS;
}

export function recordPnl(delta) { dailyPnl += delta; }

// Capped Kelly: never risk more than 5% of bankroll per trade,
// and downscale by oracle/feeder confidence.
export function kellyFraction(edge, confidence = 0.5) {
  const raw = edge * 2; // crude binary-Kelly proxy
  const capped = Math.max(0, Math.min(0.05, raw)) * confidence;
  return capped;
}
