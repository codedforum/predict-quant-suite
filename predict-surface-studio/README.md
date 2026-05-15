# Predict Surface Studio

Live 3D volatility surface viewer for [DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) on Sui.

## What it does
- Streams `oracle::OracleSVIUpdated` events from the public Predict indexer
- Reconstructs the Gatheral raw SVI parameterization (`a, b, rho, m, sigma`) into a strike x expiry x IV surface
- Renders the surface in 3D with `react-three-fiber`
- Time-travel slider replays the last N snapshots
- Live butterfly + calendar arbitrage-free checker flags violations

## Stack
Vite + React + TypeScript + three.js + @react-three/fiber + @mysten/sui

## Run locally
```
cp .env.example .env
npm install
npm run dev          # frontend on :5173
npm run poller       # optional: tail OracleSVIUpdated events to stdout
```

If `predict-server.testnet.mystenlabs.com` is unreachable, the UI falls back to a mock SVI series so the page still loads.

## Deploy
Static frontend - any host (Vercel, Netlify, Hostinger). Optional poller as PM2 service. Switch endpoints via `VITE_PREDICT_SERVER` when mainnet ships.

## License
MIT
