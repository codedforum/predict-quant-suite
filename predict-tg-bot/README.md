# Predict TG Bot

Telegram bot for trading on [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) directly from any chat.

## Commands
- `/up 70k 15m 100usdc` - buy CALL binary at strike 70000, 15-minute expiry, 100 dUSDC
- `/down 70k 15m 100usdc` - buy PUT binary
- `/pnl` - show equity + open positions
- `/redeem` - claim all settled payouts
- `/faucet` - request testnet dUSDC
- `/leaderboard` - top traders this week

## How it works
- One custodial Sui wallet per Telegram user, AES-256-GCM encrypted with a master `WALLET_ENC_KEY`
- First message auto-creates a `PredictManager` and faucets dUSDC
- Every trade is a programmable transaction block built with `@mysten/sui`, signed server-side, broadcast to Sui testnet
- SQLite tracks trades + leaderboard

## Stack
node-telegram-bot-api + @mysten/sui + better-sqlite3

## Run
```
cp .env.example .env
# fill in TG_TOKEN (from @BotFather) and a strong WALLET_ENC_KEY (>= 32 chars)
npm install
npm start
# or for production:
npm run pm2
```

## Security
- Custodial wallets are never the user's main address - they exist only inside this bot
- Master encryption key is the only piece you must back up; lose it and every user wallet is unrecoverable
- SQLite file should be backed up nightly if you run this in production

## License
MIT
