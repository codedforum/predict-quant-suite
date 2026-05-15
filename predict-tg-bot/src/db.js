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
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER,
  oracle_id TEXT,
  expiry INTEGER,
  strike INTEGER,
  is_up INTEGER,
  quantity INTEGER,
  cost INTEGER,
  status TEXT DEFAULT 'open',
  redeemed_payout INTEGER DEFAULT 0,
  tx TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_positions_user_open ON positions(tg_id, status);
`);

export async function ensureUser(from) {
  const row = db.prepare('SELECT tg_id FROM users WHERE tg_id = ?').get(from.id);
  if (!row) {
    db.prepare('INSERT INTO users (tg_id, username, created_at) VALUES (?, ?, ?)').run(from.id, from.username || '', Date.now());
  }
  return { tgId: from.id, username: from.username };
}

export function saveKey(tgId, enc) { db.prepare('UPDATE users SET enc_key = ? WHERE tg_id = ?').run(enc, tgId); }
export function loadKey(tgId) { return db.prepare('SELECT enc_key FROM users WHERE tg_id = ?').get(tgId)?.enc_key; }
export function savePredictManagerId(tgId, mid) { db.prepare('UPDATE users SET manager_id = ? WHERE tg_id = ?').run(mid, tgId); }
export function loadPredictManagerId(tgId) { return db.prepare('SELECT manager_id FROM users WHERE tg_id = ?').get(tgId)?.manager_id; }

export function recordPosition({ tgId, oracleId, expiry, strike, isUp, quantity, cost, tx }) {
  db.prepare(`INSERT INTO positions (tg_id, oracle_id, expiry, strike, is_up, quantity, cost, tx, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    tgId, oracleId, expiry, strike, isUp ? 1 : 0, quantity, cost, tx, Date.now()
  );
}

export function openPositions(tgId) {
  return db.prepare(`SELECT id, oracle_id AS oracleId, expiry, strike, is_up AS isUp, quantity, cost
                     FROM positions WHERE tg_id = ? AND status = 'open'`).all(tgId);
}

export function markRedeemed(positionId, payout) {
  db.prepare(`UPDATE positions SET status = 'redeemed', redeemed_payout = ? WHERE id = ?`).run(payout, positionId);
}

export function topUsers(n = 10) {
  return db.prepare(`
    SELECT u.tg_id AS tgId, u.username,
           COUNT(p.id) AS trades,
           COALESCE(SUM(p.redeemed_payout - p.cost), 0) / 1000000.0 AS realized
    FROM users u LEFT JOIN positions p ON p.tg_id = u.tg_id AND p.created_at > ?
    GROUP BY u.tg_id ORDER BY realized DESC LIMIT ?
  `).all(Date.now() - 7 * 86400_000, n);
}
