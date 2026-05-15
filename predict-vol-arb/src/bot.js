import 'dotenv/config';
import { fetchPredictSurface } from './predictClient.js';
import { fetchPolymarketSmile } from './polymarketClient.js';
import { findArb } from './strategies/volArb.js';
import { kellyFraction, killSwitch } from './risk.js';
import { logQuote, logTrade } from './db.js';

const MIN_EDGE_VOL = parseFloat(process.env.MIN_EDGE_VOL || '0.04');
const POLL_MS = parseInt(process.env.POLL_MS || '15000', 10);
const DRY_RUN = process.env.DRY_RUN !== 'false';

async function loop() {
  while (true) {
    try {
      if (killSwitch()) {
        console.warn('kill switch active, sleeping');
        await sleep(60000);
        continue;
      }

      const [predict, poly] = await Promise.all([
        fetchPredictSurface({ symbol: 'BTC' }),
        fetchPolymarketSmile({ symbol: 'BTC' }),
      ]);

      logQuote({ ts: Date.now(), predictIv: predict.atmIv, polyIv: poly.atmIv });

      const opps = findArb({ predict, poly, minEdge: MIN_EDGE_VOL });
      for (const op of opps) {
        const size = kellyFraction(op.edge, op.confidence) * (parseFloat(process.env.BANKROLL_USDC || '1000'));
        console.log(`ARB ${op.side} ${op.expiry} edge=${op.edge.toFixed(4)} size=${size.toFixed(2)}`);
        if (!DRY_RUN) {
          // wire predict::mint here + offsetting Polymarket order
        }
        logTrade({ ts: Date.now(), ...op, size, dry: DRY_RUN });
      }
    } catch (e) {
      console.error('loop error', e.message);
    }
    await sleep(POLL_MS);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`predict-vol-arb up | dry=${DRY_RUN} edge=${MIN_EDGE_VOL}`);
loop();
