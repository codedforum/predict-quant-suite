import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { ensureUser, recordTrade, getUser, topUsers } from './db.js';
import { mintBinary, redeemAll, getManagerPnl } from './predict.js';
import { faucetDusdc, ensurePredictManager } from './sui.js';

const TOKEN = process.env.TG_TOKEN;

// Real BotFather tokens look like: `<9-11 digit numeric id>:<35-char hash>`.
// Reject placeholders / sentinels / our own fallback strings before we hit Telegram,
// otherwise polling spams `getUpdates` and burns rate limit.
function looksLikeRealToken(t) {
  if (!t || typeof t !== 'string') return false;
  const m = /^(\d{8,12}):([A-Za-z0-9_-]{30,40})$/.exec(t.trim());
  return Boolean(m);
}

if (!looksLikeRealToken(TOKEN)) {
  console.error([
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║ TG_TOKEN missing or invalid - exiting cleanly (no polling).      ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    '║ Telegram bot tokens look like: 1234567890:AAH...35chars          ║',
    '║                                                                  ║',
    '║ To fix:                                                          ║',
    '║   1. Open @BotFather on Telegram                                 ║',
    '║   2. /newbot, choose name + username                             ║',
    '║   3. Copy the token BotFather returns                            ║',
    '║   4. On VPS: edit /root/predict-quant-suite/predict-tg-bot/.env  ║',
    '║      set TG_TOKEN=<paste real token>                             ║',
    '║   5. pm2 restart predict-tg-bot --update-env                     ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n'));
  process.exit(0); // exit 0 so PM2 marks the process as "stopped" not "errored"
}

const bot = new TelegramBot(TOKEN, { polling: true });

// /up <strike> <window> <usdc>   e.g.  /up 70k 15m 100usdc
bot.onText(/^\/(up|down)\s+(\S+)\s+(\S+)\s+(\S+)/i, async (msg, m) => {
  const chatId = msg.chat.id;
  const direction = m[1].toLowerCase() === 'up' ? 'CALL' : 'PUT';
  const strike = parseStrike(m[2]);
  const windowMs = parseWindow(m[3]);
  const sizeUsdc = parseSize(m[4]);

  const user = await ensureUser(msg.from);
  await ensurePredictManager(user);
  const tx = await mintBinary({ user, direction, strike, windowMs, sizeUsdc });
  recordTrade({ tgId: user.tgId, direction, strike, sizeUsdc, txDigest: tx.digest });

  await bot.sendMessage(chatId, [
    `${direction} ${strike} in ${m[3]} for ${sizeUsdc} dUSDC`,
    `tx: https://suiscan.xyz/testnet/tx/${tx.digest}`,
  ].join('\n'), { reply_markup: kb(tx.positionId) });
});

bot.onText(/^\/pnl/, async (msg) => {
  const user = await ensureUser(msg.from);
  const { realized, open, equity } = await getManagerPnl(user);
  await bot.sendMessage(msg.chat.id, `equity: ${equity} dUSDC\nopen: ${open}\nrealized: ${realized}`);
});

bot.onText(/^\/redeem/, async (msg) => {
  const user = await ensureUser(msg.from);
  const r = await redeemAll(user);
  await bot.sendMessage(msg.chat.id, `redeemed ${r.count} positions, +${r.payout} dUSDC`);
});

bot.onText(/^\/faucet/, async (msg) => {
  const user = await ensureUser(msg.from);
  const r = await faucetDusdc(user, 1000);
  await bot.sendMessage(msg.chat.id, `+${r.amount} dUSDC sent. balance: ${r.balance}`);
});

bot.onText(/^\/leaderboard/, async (msg) => {
  const rows = topUsers(10);
  const text = rows.map((r, i) => `${i + 1}. @${r.username || r.tgId}  ${r.realized.toFixed(2)} dUSDC  (${r.trades} trades)`).join('\n');
  await bot.sendMessage(msg.chat.id, text || 'no trades yet');
});

bot.onText(/^\/start|^\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id, [
    'Predict Bot - DeepBook Predict on Sui',
    '',
    '/up 70k 15m 100usdc   buy CALL binary',
    '/down 70k 15m 100usdc buy PUT binary',
    '/pnl                  show equity + open positions',
    '/redeem               claim all settled payouts',
    '/faucet               request testnet dUSDC',
    '/leaderboard          top traders this week',
  ].join('\n'));
});

bot.on('callback_query', async (q) => {
  const [action, positionId] = (q.data || '').split(':');
  const user = await ensureUser(q.from);
  if (action === 'redeem') {
    await redeemAll(user, positionId);
    await bot.answerCallbackQuery(q.id, { text: 'redeemed' });
  }
});

function kb(positionId) {
  return {
    inline_keyboard: [[
      { text: 'redeem now', callback_data: `redeem:${positionId}` },
      { text: 'show pnl', callback_data: `pnl:${positionId}` },
    ]],
  };
}

function parseStrike(s) {
  const m = /^([\d.]+)([kKmM]?)$/.exec(s.trim());
  if (!m) throw new Error('strike like 70k');
  const mult = m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1;
  return parseFloat(m[1]) * mult;
}
function parseWindow(s) {
  const m = /^(\d+)(s|m|h|d)$/.exec(s.trim());
  if (!m) throw new Error('window like 15m');
  const u = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
  return parseInt(m[1], 10) * u;
}
function parseSize(s) {
  const m = /^([\d.]+)\s*usdc?$/i.exec(s.trim());
  if (!m) throw new Error('size like 100usdc');
  return parseFloat(m[1]);
}

console.log('predict-tg-bot up');
