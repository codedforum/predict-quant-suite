import 'dotenv/config';
import { fetchPredictSurface } from './predictClient.js';
import { fetchCrossFeedAtmIv } from './crossFeed.js';
import { findArb } from './strategies/volArb.js';
import { kellyFraction, killSwitch } from './risk.js';
import { logQuote, logTrade, logCrossFeed, recordOpenPosition } from './db.js';
import { refreshHedge } from './hedger.js';

const MIN_EDGE_VOL = parseFloat(process.env.MIN_EDGE_VOL || '0.04');
const POLL_MS = parseInt(process.env.POLL_MS || '15000', 10);
const HEDGE_POLL_MS = parseInt(process.env.HEDGE_POLL_MS || '30000', 10);
const DRY_RUN = process.env.DRY_RUN !== 'false';

async function loop() {
  let lastHedgeAt = 0;
  while (true) {
    try {
      if (killSwitch()) {
        console.warn('kill switch active, sleeping');
        await sleep(60000);
        continue;
      }

      const predict = await fetchPredictSurface({ symbol: 'BTC' });
      const cross = await fetchCrossFeedAtmIv({
        targetExpirySec: predict.expirySec,
        symbol: 'BTC',
      });

      logCrossFeed({
        ts: Date.now(),
        source: cross.source,
        sourceLabel: cross.sourceLabel,
        iv: cross.atmIv,
        spot: cross.spot,
        expirySec: cross.expirySec,
        expiryDriftSec: cross.expiryDriftSec,
        errors: cross.errors,
      });

      logQuote({
        ts: Date.now(),
        predictIv: predict.atmIv,
        polyIv: cross.source === 'polymarket' ? cross.atmIv : null,
        crossIv: cross.atmIv,
        crossSource: cross.source,
      });

      // findArb expects { atmIv } from the cross-side; pass cross-feed under that shape
      const opps = findArb({ predict, poly: { atmIv: cross.atmIv }, minEdge: MIN_EDGE_VOL });
      for (const op of opps) {
        const size = kellyFraction(op.edge, op.confidence) * (parseFloat(process.env.BANKROLL_USDC || '1000'));
        const sizeBtc = predict.forward > 0 ? size / predict.forward : 0;
        console.log(
          `ARB ${op.side} ${op.expiry} edge=${op.edge.toFixed(4)} ` +
          `size=$${size.toFixed(2)} (${sizeBtc.toFixed(5)} BTC) source=${cross.source}`
        );
        if (!DRY_RUN) {
          // wire predict::mint here in Wave 2
        }
        logTrade({ ts: Date.now(), ...op, size, dry: DRY_RUN });

        // Synthetic open-position row so the hedger has delta to compute against
        // in DRY_RUN. In live mode this row gets written from the on-chain mint receipt.
        if (sizeBtc > 0) {
          recordOpenPosition({
            ts: Date.now(),
            side: op.side === 'buyPredict' ? 'long' : 'short',
            kind: op.side === 'buyPredict' ? 'C' : 'P',
            strike: op.strike,
            expirySec: op.expiry,
            sizeBtc,
            sigma: predict.atmIv,
            oracleId: predict.oracleId,
          });
        }
      }

      // Delta-hedge refresh on its own cadence (slower than the quote loop)
      if (Date.now() - lastHedgeAt >= HEDGE_POLL_MS) {
        try {
          const h = await refreshHedge();
          lastHedgeAt = Date.now();
          if (h?.action) {
            console.log(
              `HEDGE ${h.action.side} ${h.action.sizeBtc.toFixed(5)} BTC @${h.spot.toFixed(0)} ` +
              `(portfolio Δ=${h.portfolioDelta.toFixed(4)}, drift=${h.drift.toFixed(4)})`
            );
          }
        } catch (e) {
          console.warn('hedger error:', e.message);
        }
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
