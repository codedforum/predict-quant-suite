# Predict Quant Suite — DeepSurge Submission Package

Platform: https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf
Deadline: 2026-06-21 PT. Save as draft now to reserve the name, finalize after the video.

---

## Ready-to-paste form fields

| Field | Value |
|---|---|
| **Project Name** | `Predict Quant Suite` |
| **Track** | `Special - DeepBook` (also tick `The Agentic Web`) |
| **Deployment Network** | `Sui Testnet` |
| **Contract Address** | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| **Project Repo** | `https://github.com/codedforum/predict-quant-suite` |
| **Website** | `https://predict.smartcodedbot.com` |
| **Demo Video** | (paste YouTube URL after recording — script below) |
| **Team** | olawuwo nurudeen + poc |

Live on-chain proof points to mention (all verifiable on Sui testnet) — the FULL trade lifecycle:
- create_manager: PredictManager `0xfd03ac6b53abec4d369c93a1697491c33751bc970823d768081fafbb53da3a5e`
- mint: CALL on BTC oracle, strike $63,000 — tx `72fCQQxEgMsvFx5s78NLajCQYKM5aTeBWEQtozZGT3hr` (cost 0.358 dUSDC)
- redeem (early exit, sold back to the vault at bid): tx `DuKoWRSUvd2XyU2f73LmQeAJK6AQCw8De12vdCujtt8v` (payout 0.536 dUSDC → +0.18 realized P&L)
- Every leg priced live against the on-chain Gatheral SVI surface.

---

## Description (paste into the rich-text editor)

**Predict Quant Suite** is a professional analytics + trading stack built on DeepBook Predict — Sui's expiry-based, oracle-priced options/prediction primitive.

It is two products that share one IV engine:

**1. Surface Studio** — a 3D volatility-surface viewer for every live Predict oracle. Toggle IV, delta, vega and gamma surfaces; cross-section the smile; read the implied-probability histogram; compare oracles side by side; track the ATM and 25-delta wing term structure against a realized-vs-implied volatility cone. The Markets tab renders the live on-chain orderbook with a BSM fair-value edge column (17 strikes priced in a single batched devInspect PTB), and the Activity tab streams real on-chain events with a contributor leaderboard and a day-of-week x hour heatmap. Everything is computed from live Gatheral SVI parameters pulled straight from chain (with a transparent chain-direct fallback when the public indexer 404s).

**2. Vol-Arb bot** — a keeper that prices the Predict IV surface against a Deribit-primary cross-feed (with Polymarket fallback) every 15 seconds, surfaces arbitrage opportunities, and runs an optional Hyperliquid delta-hedge that computes per-position BSM delta and rebalances a perp when portfolio drift crosses a threshold. A backtest view replays the strategy over recorded spread history.

The suite is not read-only marketing — it trades. The full mint path is live: create a PredictManager, deposit dUSDC, price a binary against the on-chain SVI surface, and mint a CALL/PUT position, all verified end-to-end on testnet (see the on-chain tx above). A companion Telegram quick-predict bot wraps the same path for non-crypto-native users with custodial per-user wallets.

Why DeepBook Predict and not a Polymarket clone: a Predict position is composable (levered via deepbook_margin, exited via Spot in one PTB), settles sub-400ms for game-like UX, is seeded by an internal market maker so there is no cold-start liquidity gap, and is vol-surface-priced across every strike and expiry rather than hand-listed binaries. Surface Studio is the recruiting tool for sophisticated traders; the vol-arb bot is the mainnet-day-one strategy; the TG bot is the lowest-friction on-ramp.

Built for Sui Overflow 2026. Mainnet redeploy planned for Predict mainnet day-one.

---

## Demo video script (target 2:30, hard cap 3:00)

Record at https://predict.smartcodedbot.com. Keyboard: `1`-`6` switch tabs, `C` calculator, `R` reset 3D camera, `A` auto-rotate.

- **0:00-0:15 — Hook.** "This is Predict Quant Suite, built on DeepBook Predict, Sui's on-chain options primitive. It's a full vol-surface analytics stack and a trading bot, and it mints real positions on testnet. Let me show you."
- **0:15-0:45 — Surface tab (press `1`, `A` to auto-rotate).** "Every live Predict oracle, as a 3D volatility surface straight from on-chain SVI parameters. Toggle implied vol, delta, vega, gamma. Here's the smile cross-section and the implied-probability histogram. No indexer dependency — this reads the chain directly."
- **0:45-1:05 — Smile + Term (press `2`, then `3`).** "Overlay smiles across oracles and compare two head to head. Term tab: ATM and 25-delta wing term structure, plus a realized-versus-implied vol cone."
- **1:05-1:45 — Vol-Arb tab (press `4`).** "The keeper prices Predict IV against a Deribit cross-feed every 15 seconds. Live spread chart, arbitrage opportunities feed, bot health, and the on-chain vault state — a million dollars of dUSDC liquidity. Down here, the Hyperliquid delta-hedge: per-position BSM delta, drift versus threshold, and the next rebalance action. Backtest replays the strategy over recorded spread history."
- **1:45-2:10 — Activity + Markets (press `5`, then `6`).** "Every on-chain Predict event, live, with a contributor leaderboard and an activity heatmap. Markets tab: the live on-chain orderbook with a BSM fair-value edge column — seventeen strikes priced in a single batched call."
- **2:10-2:30 — Trade proof + close (press `C`).** "And it trades. The calculator previews cost, payout and Greeks for any strike. On testnet we've already created a manager, deposited dUSDC, and minted a live CALL at sixty-three thousand — here's the transaction on Suiscan. Composable, sub-400ms, vol-surface-priced. That's Predict Quant Suite."

On-screen at 2:20: paste the Suiscan link https://suiscan.xyz/testnet/tx/72fCQQxEgMsvFx5s78NLajCQYKM5aTeBWEQtozZGT3hr

---

## Submission checklist
- [x] Frontend live (predict.smartcoded.xyz, HTTP 200)
- [x] API live (predict-api.smartcodedbot.com, 21 endpoints)
- [x] Vol-arb bot + dashboard running (restarted clean 2026-06-11)
- [x] On-chain end-to-end mint proven (manager + CALL position)
- [x] Repo public + current (local fix de10cdb pending push confirm)
- [ ] DeepSurge form saved as draft (paste fields above)
- [ ] Demo video recorded + YouTube URL pasted
- [ ] TG bot deployed (BLOCKED: needs a fresh BotFather token)
- [ ] Form finalized / submitted before Jun 21 PT
