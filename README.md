# Sui Overflow 2026 - DeepBook Predict Suite

Three composable builds for the **DeepBook track** ($70K pool).

| Project | Lane | Idea bank | Target prize |
|---|---|---|---|
| `predict-surface-studio` | Analytics & Dev Tooling | #9 - Predict Surface Studio | 1st / 2nd ($35k / $15k) |
| `predict-tg-bot` | Frontends & Consumer Apps | #5 - Telegram Quick-Predict Bot | 2nd / 3rd ($15k / $7.5k) |
| `predict-vol-arb` | Bots, Keepers, Arbitrage | #7 - Vol-Arb Predict ↔ Polymarket | **1st** ($35k) |

The vol-arb bot consumes the surface studio's IV calc as its own input - they ship together as one **"Predict Quant Suite"** submission. The TG bot ships as a separate solo submission for double exposure.

## Key dates (Pacific Time)
- **June 21, 2026** - submission deadline
- **July 8** - shortlist announced
- **July 20-21** - Demo Day (live virtual judging)
- **August 27** - winners announced

## Award structure
- 50% paid on winner announcement
- 50% paid on mainnet deployment
- 100% upfront if already on mainnet by Aug 27

Predict mainnet ships "later in 2026" per the docs - plan to redeploy on day one to claim full prize.

## Tracks to register for
- **Special - DeepBook** (primary)
- **The Agentic Web** (TG bot + vol-arb both qualify as autonomous agents)

## Builder support
- Telegram: https://go.sui.io/ofw-deepbook-tg
- dUSDC faucet: linked from the official problem statement Notion

## Hard requirements per project
- Integrate `deepbook_predict` contract on testnet
- End-to-end working flow (judges will test it)
- Vault strategies need simulation results

## Repo layout
```
sui-overflow/
├── predict-surface-studio/   # Vite + React + three.js
├── predict-tg-bot/           # node-telegram-bot-api + @mysten/sui
└── predict-vol-arb/          # axios + express + @mysten/sui
```

Each project has its own README, .env.example, and is independently runnable.
