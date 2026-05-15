# Predict Surface Studio

Live 3-D volatility surface viewer for DeepBook Predict on Sui.

## What it does
- Streams `oracle::OracleSVIUpdated` events from the public Predict indexer
- Reconstructs the Gatheral SVI parameterization (a, b, rho, m, sigma) into a strike x expiry x IV surface
- Renders the surface in 3D with `react-three-fiber`
- Time-travel slider replays the last N snapshots
- Arbitrage-free checker flags butterfly + calendar violations live

## Stack
Vite + React + TypeScript + three.js + @react-three/fiber + @mysten/sui

## Run locally
```
cp .env.example .env
npm install
npm run dev          # frontend on :5173 (uses public predict-server endpoint)
npm run poller       # optional: tail OracleSVIUpdated events to stdout
```

## Hackathon track
Sui Overflow 2026 / DeepBook Predict / Analytics & Developer Tooling lane (idea #9 from the official idea bank).

## Deploy plan
- Static frontend on Hostinger or Vercel
- Optional poller as PM2 service on VPS
- Mainnet day-one switch via `VITE_PREDICT_SERVER` env var
