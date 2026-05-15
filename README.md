# Predict Quant Suite

Quant tooling for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) - the on-chain prediction + options primitive on Sui.

Three composable products that share one volatility model:

- **Surface Studio** - live 3D viewer of the SVI volatility surface streamed from on-chain `OracleSVIUpdated` events, with arbitrage-free butterfly + calendar checks.
- **Vol-Arb Bot** - cross-venue arbitrage between DeepBook Predict and Polymarket BTC binary smiles. Trades the spread when implied vol disagrees by more than a configurable edge.
- **Telegram Quick-Predict Bot** - one-line trading from any Telegram chat (`/up 70k 15m 100usdc`). Custodial wallet per user, auto-creates a `PredictManager`, faucets dUSDC on first use, redeems on settlement.

The three pieces are independent but share the same `sviMath` core, so the surface viewer shows you exactly the IV the bot is trading against.

## Repo layout
```
predict-surface-studio/   Vite + React + react-three-fiber       (frontend)
predict-vol-arb/          axios + express + @mysten/sui          (bot + dashboard)
predict-tg-bot/           node-telegram-bot-api + @mysten/sui    (bot + sqlite)
```

Each subdir is independently runnable. See its README for details.

## Quickstart
```
# pick one
cd predict-surface-studio && npm install && npm run dev          # http://localhost:5173
cd predict-vol-arb        && npm install && npm run bot          # paper trade
cd predict-tg-bot         && npm install && npm start            # needs TG_TOKEN
```

## Volatility model
All three products use the Gatheral raw SVI parameterization:
```
w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
IV   = sqrt(w / T)
```
where `k = ln(K / F)`. The five parameters are streamed from the protocol's `OracleSVI` objects each tick.

Arb-free conditions checked:
- **Butterfly**: `g(k) = (1 - k*w'/(2w))^2 - (w'^2/4)*(1/w + 1/4) + w''/2 >= 0`
- **Calendar**: `w_T2(k) >= w_T1(k)` for all `T2 > T1`

## Network
Sui testnet today (DeepBook Predict is on the `predict-testnet-4-16` branch). Mainnet redeploy planned when the protocol ships.

## Security
Per-service secrets are derived from a single root key via `sha256(secret + ":" + serviceName)` rather than reused literally. See [`PASSPHRASE_DERIVATION.md`](PASSPHRASE_DERIVATION.md). All `.env` files are chmod 600 and gitignored.

## License
MIT
