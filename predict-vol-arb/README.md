# Predict Vol-Arb Bot

Cross-venue volatility arbitrage between [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) on Sui and [Polymarket](https://polymarket.com).

## Strategy
1. Pull Predict's `OracleSVI` snapshot, compute ATM implied vol from the SVI surface.
2. Pull Polymarket BTC binary smile, invert binary midpoints to implied probabilities, then to implied vol assuming the same expiry.
3. If `|polyIv - predictIv| > MIN_EDGE_VOL`, trade the spread:
   - `buyPredict` when Predict IV is cheap vs Polymarket
   - `sellPredict` when Predict IV is rich vs Polymarket
4. Capped-Kelly sizing scaled by oracle confidence
5. Daily-loss kill switch + file-based emergency kill (`touch /tmp/predict-vol-arb.kill`)

## Stack
@mysten/sui + axios + better-sqlite3 + express

## Run
```
cp .env.example .env
npm install
DRY_RUN=true npm run bot          # paper-trade only, logs opportunities to sqlite
npm run dashboard                  # live PnL + IV chart at http://localhost:3097
# production:
npm run pm2
```

## Roadmap
- Hyperliquid delta-hedge so PnL is pure vol edge
- Cubic-spline smile interpolation for off-ATM edges
- Per-feeder lag detection + auto-pause when SVI updates go stale
- Mainnet flip via `PREDICT_PKG` and `DUSDC_TYPE` env vars + `DRY_RUN=false`

## License
MIT
