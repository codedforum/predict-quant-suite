# Predict Vol-Arb Bot

Cross-venue volatility arbitrage between DeepBook Predict (Sui) and Polymarket.

## Strategy
1. Pull Predict's `OracleSVI` snapshot, compute ATM implied vol from the SVI surface.
2. Pull Polymarket BTC binary smile, invert binary midpoints to implied probabilities, then to implied vol assuming the same expiry.
3. If `|polyIv - predictIv| > MIN_EDGE_VOL`, trade the spread:
   - `buyPredict` when Predict IV is cheap vs Polymarket
   - `sellPredict` when Predict IV is rich vs Polymarket
4. Capped-Kelly sizing scaled by oracle confidence, daily-loss kill switch, file-based emergency kill.

The DeepBook Predict problem statement explicitly calls this "the single most realistic mainnet-day-one strategy."

## Stack
@mysten/sui + axios + better-sqlite3 + express

## Run
```
cp .env.example .env
npm install
DRY_RUN=true npm run bot          # paper-trade only, logs opportunities
npm run dashboard                  # live PnL + IV chart on :3097
# or production:
npm run pm2
```

## Stretch goals
- Delta-hedge the binary on Hyperliquid perps so PnL is pure vol edge
- Cubic-spline smile interpolation for off-ATM edges
- Per-feeder lag detection + auto-pause when SVI updates go stale

## Hackathon track
Sui Overflow 2026 / DeepBook Predict / Bots, Keepers, Arbitrage lane (idea #7 from the official idea bank). Also competes in the Agentic Web track.

## Deploy plan
- VPS (PM2) for bot + dashboard
- Mainnet day-one switch via `PREDICT_PKG` and `DUSDC_TYPE`, then flip `DRY_RUN=false`
