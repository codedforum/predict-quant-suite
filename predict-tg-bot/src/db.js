import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'predict-bot.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  tg_id INTEGER PRIMARY KEY,
  username TEXT,
  enc_key TEXT,
  manager_id TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER,
  direction TEXT,
  strike REAL,
  size REAL,
  realized REAL DEFAULT 0,
  tx TEXT,
  created_at INTEGER
);
`);

export async function ensureUser(from) {
  const row = db.prepare('SELECT tg_id, username FROM users WHERE tg_id = ?').get(from.id);
  if (!row) {
    db.prepare('INSERT INTO users (tg_id, username, created_at) VALUES (?, ?, ?)').run(from.id, from.username || '', Date.now());
  }
  return { tgId: from.id, username: from.username };
}

export function saveKey(tgId, enc) { db.prepare('UPDATE users SET enc_key = ? WHERE tg_id = ?').run(enc, tgId); }
export function loadKey(tgId) { return db.prepare('SELECT enc_key FROM users WHERE tg_id = ?').get(tgId)?.enc_key; }
export function savePredictManagerId(tgId, mid) { db.prepare('UPDATE users SET manager_id = ? WHERE tg_id = ?').run(mid, tgId); }
export function loadPredictManagerId(tgId) { return db.prepare('SELECT manager_id FROM users WHERE tg_id = ?').get(tgId)?.manager_id; }
export function getUser(tgId) { return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId); }

export function recordTrade({ tgId, direction, strike, sizeUsdc, txDigest }) {
  db.prepare('INSERT INTO trades (tg_id, direction, strike, size, tx, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    tgId, direction, strike, sizeUsdc, txDigest, Date.now()
  );
}

export function topUsers(n = 10) {
  return db.prepare(`
    SELECT u.tg_id AS tgId, u.username, COUNT(t.id) AS trades, COALESCE(SUM(t.realized), 0) AS realized
    FROM users u LEFT JOIN trades t ON t.tg_id = u.tg_id
    WHERE t.created_at > ?
    GROUP BY u.tg_id ORDER BY realized DESC LIMIT ?
  `).all(Date.now() - 7 * 86400_000, n);
}
