import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'vol-arb.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, predict_iv REAL, poly_iv REAL,
  cross_iv REAL, cross_source TEXT
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, side TEXT, expiry INTEGER, strike REAL,
  predict_iv REAL, poly_iv REAL, edge REAL, size REAL,
  realized REAL DEFAULT 0, dry INTEGER
);
CREATE TABLE IF NOT EXISTS open_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER,
  side TEXT,        -- 'long' | 'short' vs vol (Predict mint direction)
  kind TEXT,        -- 'C' | 'P' (call/put)
  strike REAL,
  expiry_sec INTEGER,
  size_btc REAL,    -- notional in BTC equivalent
  sigma REAL,       -- IV at mint time
  oracle_id TEXT,
  status TEXT DEFAULT 'open'   -- 'open' | 'closed'
);
CREATE TABLE IF NOT EXISTS hedge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER,
  spot REAL,
  portfolio_delta REAL,
  hl_current REAL,
  hedge_target REAL,
  drift REAL,
  action_side TEXT,
  action_size REAL,
  live INTEGER
);
CREATE TABLE IF NOT EXISTS cross_feed_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER,
  source TEXT,
  source_label TEXT,
  iv REAL,
  spot REAL,
  expiry_sec INTEGER,
  expiry_drift_sec INTEGER,
  errors_json TEXT
);
`);

// Best-effort column upgrades for older DBs already on disk
function ensureColumn(table, column, type) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!rows.find((r) => r.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('quotes', 'cross_iv', 'REAL');
ensureColumn('quotes', 'cross_source', 'TEXT');

export function logQuote(q) {
  db.prepare(
    'INSERT INTO quotes (ts, predict_iv, poly_iv, cross_iv, cross_source) VALUES (?, ?, ?, ?, ?)'
  ).run(q.ts, q.predictIv, q.polyIv ?? null, q.crossIv ?? null, q.crossSource ?? null);
}

export function logTrade(t) {
  db.prepare(`INSERT INTO trades (ts, side, expiry, strike, predict_iv, poly_iv, edge, size, dry)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    t.ts, t.side, t.expiry, t.strike, t.predictIv, t.polyIv, t.edge, t.size, t.dry ? 1 : 0
  );
}

export function recentQuotes(n = 200) {
  return db
    .prepare('SELECT ts, predict_iv AS predictIv, poly_iv AS polyIv, cross_iv AS crossIv, cross_source AS crossSource FROM quotes ORDER BY id DESC LIMIT ?')
    .all(n)
    .reverse();
}
export function recentTrades(n = 50) {
  return db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT ?').all(n);
}

// ---- Open positions (for the hedger) ----------------------------------------

export function openPositions() {
  return db
    .prepare(`SELECT id, side, kind, strike, expiry_sec AS expirySec, size_btc AS sizeBtc, sigma, oracle_id AS oracleId
              FROM open_positions WHERE status = 'open' AND expiry_sec > ?`)
    .all(Math.floor(Date.now() / 1000));
}

export function recordOpenPosition(p) {
  db.prepare(`INSERT INTO open_positions (ts, side, kind, strike, expiry_sec, size_btc, sigma, oracle_id, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`).run(
    p.ts ?? Date.now(), p.side, p.kind, p.strike, p.expirySec, p.sizeBtc, p.sigma, p.oracleId ?? null
  );
}

export function closePosition(id) {
  db.prepare(`UPDATE open_positions SET status = 'closed' WHERE id = ?`).run(id);
}

// ---- Hedge log --------------------------------------------------------------

export function logHedge(h) {
  db.prepare(`INSERT INTO hedge_log (ts, spot, portfolio_delta, hl_current, hedge_target, drift, action_side, action_size, live)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    h.ts, h.spot, h.portfolio_delta, h.hl_current, h.hedge_target, h.drift, h.action_side, h.action_size, h.live
  );
}
export function recentHedge(n = 100) {
  return db.prepare('SELECT * FROM hedge_log ORDER BY id DESC LIMIT ?').all(n).reverse();
}

// ---- Cross-feed log ---------------------------------------------------------

export function logCrossFeed(c) {
  db.prepare(`INSERT INTO cross_feed_log (ts, source, source_label, iv, spot, expiry_sec, expiry_drift_sec, errors_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    c.ts, c.source, c.sourceLabel ?? null, c.iv ?? null, c.spot ?? null,
    c.expirySec ?? null, c.expiryDriftSec ?? null, c.errors ? JSON.stringify(c.errors) : null
  );
}
export function recentCrossFeed(n = 100) {
  return db.prepare('SELECT * FROM cross_feed_log ORDER BY id DESC LIMIT ?').all(n).reverse();
}

// ---- Source-of-truth health ------------------------------------------------

export function crossFeedHealth() {
  const row = db.prepare(`SELECT source, COUNT(*) as n FROM cross_feed_log WHERE ts > ? GROUP BY source`)
                .all(Date.now() - 24 * 3600 * 1000);
  const total = row.reduce((s, r) => s + r.n, 0) || 1;
  return row.map((r) => ({ source: r.source, count: r.n, pct: r.n / total }));
}
