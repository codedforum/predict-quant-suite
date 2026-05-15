# Predict TG Bot

Telegram bot for DeepBook Predict on Sui. Lowest-friction onboarding for prediction-market trading.

## Commands
- `/up 70k 15m 100usdc` - buy CALL binary
- `/down 70k 15m 100usdc` - buy PUT binary
- `/pnl` - equity + open positions
- `/redeem` - claim all settled payouts
- `/faucet` - request testnet dUSDC
- `/leaderboard` - top traders this week

## How it works
- Custodial wallet per Telegram user, AES-256-GCM encrypted with a master key
- First message auto-creates a `PredictManager` and faucets dUSDC
- All trades are PTBs signed server-side and broadcast to Sui testnet
- SQLite tracks trades + leaderboard

## Stack
node-telegram-bot-api + @mysten/sui + better-sqlite3

## Run
```
cp .env.example .env
# fill in TG_TOKEN (from @BotFather) and a strong WALLET_ENC_KEY
npm install
npm start
# or for production:
npm run pm2
```

## Hackathon track
Sui Overflow 2026 / DeepBook Predict / Frontends & Consumer Apps lane (idea #5 from the official idea bank). Also competes in the Agentic Web track as an AI-tradeable bot.

## Deploy plan
- VPS (PM2) for the bot process
- SQLite local file backup nightly
- Mainnet day-one switch via `PREDICT_PKG` and `DUSDC_TYPE` env vars
