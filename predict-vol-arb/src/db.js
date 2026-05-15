import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'vol-arb.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, predict_iv REAL, poly_iv REAL
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, side TEXT, expiry INTEGER, strike REAL,
  predict_iv REAL, poly_iv REAL, edge REAL, size REAL,
  realized REAL DEFAULT 0, dry INTEGER
);
`);

export function logQuote(q) {
  db.prepare('INSERT INTO quotes (ts, predict_iv, poly_iv) VALUES (?, ?, ?)').run(q.ts, q.predictIv, q.polyIv);
}

export function logTrade(t) {
  db.prepare(`INSERT INTO trades (ts, side, expiry, strike, predict_iv, poly_iv, edge, size, dry)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    t.ts, t.side, t.expiry, t.strike, t.predictIv, t.polyIv, t.edge, t.size, t.dry ? 1 : 0
  );
}

export function recentQuotes(n = 200) {
  return db.prepare('SELECT ts, predict_iv AS predictIv, poly_iv AS polyIv FROM quotes ORDER BY id DESC LIMIT ?').all(n).reverse();
}
export function recentTrades(n = 50) {
  return db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT ?').all(n);
}
