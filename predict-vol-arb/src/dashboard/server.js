import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recentQuotes, recentTrades } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://predict.smartcoded.xyz,http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/state', (req, res) => {
  res.json({
    quotes: recentQuotes(300),
    trades: recentTrades(50),
    pnl: recentTrades(10000).reduce((s, t) => s + (t.realized || 0), 0),
  });
});

const PORT = parseInt(process.env.DASHBOARD_PORT || '3097', 10);
app.listen(PORT, () => console.log(`vol-arb dashboard on :${PORT} (CORS: ${ALLOWED_ORIGINS.join(', ')})`));
