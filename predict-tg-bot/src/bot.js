import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { ensureUser, recordTrade, topUsers } from './db.js';
import { mintBinary, redeemAll, getManagerPnl } from './predict.js';
import { faucetDusdc, ensurePredictManager, fetchLiveOracle, getUsdcBalance, getOrCreateKeypair } from './sui.js';

const TOKEN = process.env.TG_TOKEN;

function looksLikeRealToken(t) {
  return typeof t === 'string' && /^(\d{8,12}):([A-Za-z0-9_-]{30,40})$/.test(t.trim());
}
if (!looksLikeRealToken(TOKEN)) {
  console.error('TG_TOKEN missing/invalid - exiting cleanly (no polling). Set it in .env and pm2 restart.');
  process.exit(0);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const SUISCAN = (d) => `https://suiscan.xyz/testnet/tx/${d}`;

// in-memory wizard state (per user) — lost on restart, which is fine for a trade draft
const wiz = {};

// ───────────────────────── helpers ─────────────────────────
const fmtUsd = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
function expiryIn(ms) {
  const s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
async function safe(chatId, fn) {
  try { await fn(); } catch (e) {
    console.error('[handler]', e?.message);
    await bot.sendMessage(chatId, `⚠️ ${e?.message || 'Something went wrong. Try again.'}`);
  }
}

// ───────────────────────── /start /help ─────────────────────────
const WELCOME = [
  '🔮 *Predict Quant Bot*',
  'Trade _DeepBook Predict_ on Sui, the on-chain options market, right here in Telegram.',
  '',
  '*How it works*',
  '1️⃣  /faucet — get free testnet dUSDC + gas (one time)',
  '2️⃣  /up or /down — open a BTC position in a few taps',
  '3️⃣  /pnl — track your positions and profit',
  '4️⃣  /redeem — claim settled payouts',
  '',
  'Self-custody: the bot makes a Sui wallet for you and you own it. Everything settles on-chain.',
  '',
  'Tap below to begin 👇',
].join('\n');
function homeKb() {
  return { inline_keyboard: [
    [{ text: '💧 Get testnet funds', callback_data: 'do_faucet' }],
    [{ text: '📈 Trade Up', callback_data: 'do_up' }, { text: '📉 Trade Down', callback_data: 'do_down' }],
    [{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '🏆 Leaderboard', callback_data: 'do_lb' }],
  ] };
}
bot.onText(/^\/(start|help)/, (msg) => safe(msg.chat.id, async () => {
  await ensureUser(msg.from);
  await bot.sendMessage(msg.chat.id, WELCOME, { parse_mode: 'Markdown', reply_markup: homeKb() });
}));

// ───────────────────────── /faucet ─────────────────────────
async function doFaucet(chatId, from) {
  const user = await ensureUser(from);
  await bot.sendMessage(chatId, '💧 Sending testnet funds…');
  const r = await faucetDusdc(user);
  if (r.already) {
    return bot.sendMessage(chatId, `✅ You've already claimed the faucet.\nBalance: *${r.balance.toFixed(2)} dUSDC*\n\nReady to trade — /up or /down.`, { parse_mode: 'Markdown', reply_markup: homeKb() });
  }
  await bot.sendMessage(chatId, [
    '💧 *Funded!*',
    `Sent *3 dUSDC* to trade + *0.03 SUI* for gas to your wallet.`,
    `Balance: *${r.balance.toFixed(2)} dUSDC*`,
    '',
    `[view tx](${SUISCAN(r.digest)})`,
    '',
    'Now open a position 👇',
  ].join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: homeKb() });
}
bot.onText(/^\/faucet/, (msg) => safe(msg.chat.id, () => doFaucet(msg.chat.id, msg.from)));

// ───────────────────────── trade wizard (/up /down) ─────────────────────────
async function startTrade(chatId, from, direction) {
  const user = await ensureUser(from);
  await bot.sendMessage(chatId, `${direction === 'CALL' ? '📈' : '📉'} Loading the live BTC market…`);
  const o = await fetchLiveOracle();
  wiz[from.id] = { direction, oracleId: o.oracleId, expiryMs: o.expiryMs, forward: o.forward };
  const base = Math.round(o.forward / 1000) * 1000;
  const strikes = [base - 2000, base - 1000, base, base + 1000, base + 2000];
  const rows = strikes.map((s) => ([{ text: `$${(s / 1000).toFixed(0)}k`, callback_data: `w_strike:${s}` }]));
  await bot.sendMessage(chatId, [
    `${direction === 'CALL' ? '📈 *Trade Up* (CALL)' : '📉 *Trade Down* (PUT)'} — BTC`,
    `Forward ~ *${fmtUsd(o.forward)}*  ·  settles in *${expiryIn(o.expiryMs)}*`,
    '',
    direction === 'CALL'
      ? 'You win if BTC is *above* your strike at expiry. Pick a strike:'
      : 'You win if BTC is *below* your strike at expiry. Pick a strike:',
  ].join('\n'), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
}
bot.onText(/^\/up/, (msg) => safe(msg.chat.id, () => startTrade(msg.chat.id, msg.from, 'CALL')));
bot.onText(/^\/down/, (msg) => safe(msg.chat.id, () => startTrade(msg.chat.id, msg.from, 'PUT')));

// ───────────────────────── /pnl /redeem /leaderboard ─────────────────────────
async function doPnl(chatId, from) {
  const user = await ensureUser(from);
  const addr = getOrCreateKeypair(user).toSuiAddress();
  const [{ realized, open, equity }, bal] = await Promise.all([getManagerPnl(user), getUsdcBalance(addr)]);
  await bot.sendMessage(chatId, [
    '📊 *Your account*',
    `Wallet balance: *${bal.toFixed(2)} dUSDC*`,
    `In-protocol equity: *${equity.toFixed(2)} dUSDC*`,
    `Open positions: *${open}*`,
    `Realized PnL: *${realized >= 0 ? '+' : ''}${realized.toFixed(2)} dUSDC*`,
  ].join('\n'), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '💰 Redeem settled', callback_data: 'do_redeem' }]] } });
}
async function doRedeem(chatId, from) {
  const user = await ensureUser(from);
  await bot.sendMessage(chatId, '💰 Checking for settled positions…');
  const r = await redeemAll(user);
  await bot.sendMessage(chatId, r.count
    ? `✅ Redeemed *${r.count}* position(s) for *+${r.payout.toFixed(2)} dUSDC*.`
    : 'No settled positions to redeem yet. Positions settle at their expiry.', { parse_mode: 'Markdown', reply_markup: homeKb() });
}
async function doLeaderboard(chatId) {
  const rows = topUsers(10);
  const body = rows.length
    ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} @${r.username || r.tgId} — ${r.realized >= 0 ? '+' : ''}${r.realized.toFixed(2)} dUSDC (${r.trades} trades)`).join('\n')
    : 'No trades yet. Be the first — /up or /down.';
  await bot.sendMessage(chatId, `🏆 *Top traders (7d)*\n${body}`, { parse_mode: 'Markdown' });
}
bot.onText(/^\/pnl/, (msg) => safe(msg.chat.id, () => doPnl(msg.chat.id, msg.from)));
bot.onText(/^\/redeem/, (msg) => safe(msg.chat.id, () => doRedeem(msg.chat.id, msg.from)));
bot.onText(/^\/leaderboard/, (msg) => safe(msg.chat.id, () => doLeaderboard(msg.chat.id)));

// ───────────────────────── callbacks (wizard + buttons) ─────────────────────────
bot.on('callback_query', (q) => safe(q.message.chat.id, async () => {
  const chatId = q.message.chat.id;
  const data = q.data || '';
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (data === 'do_faucet') return doFaucet(chatId, q.from);
  if (data === 'do_up') return startTrade(chatId, q.from, 'CALL');
  if (data === 'do_down') return startTrade(chatId, q.from, 'PUT');
  if (data === 'do_pnl') return doPnl(chatId, q.from);
  if (data === 'do_redeem') return doRedeem(chatId, q.from);
  if (data === 'do_lb') return doLeaderboard(chatId);

  const w = wiz[q.from.id];
  if (data.startsWith('w_strike:')) {
    if (!w) return bot.sendMessage(chatId, 'Trade expired, start again with /up or /down.');
    w.strike = parseInt(data.split(':')[1], 10);
    const sizes = [1, 2, 3];
    return bot.sendMessage(chatId, `Strike *$${(w.strike / 1000).toFixed(0)}k* selected.\nHow much dUSDC to commit?`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [sizes.map((s) => ({ text: `${s} dUSDC`, callback_data: `w_size:${s}` }))] },
    });
  }
  if (data.startsWith('w_size:')) {
    if (!w || !w.strike) return bot.sendMessage(chatId, 'Trade expired, start again with /up or /down.');
    w.size = parseInt(data.split(':')[1], 10);
    return bot.sendMessage(chatId, [
      '*Confirm your trade*',
      `${w.direction === 'CALL' ? '📈 CALL (up)' : '📉 PUT (down)'} BTC`,
      `Strike: *$${(w.strike / 1000).toFixed(0)}k*`,
      `Size: *${w.size} dUSDC*`,
      `Settles in: *${expiryIn(w.expiryMs)}*`,
    ].join('\n'), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Confirm trade', callback_data: 'w_go' }, { text: '✖ Cancel', callback_data: 'w_cancel' }]] } });
  }
  if (data === 'w_cancel') { delete wiz[q.from.id]; return bot.sendMessage(chatId, 'Cancelled.', { reply_markup: homeKb() }); }
  if (data === 'w_go') {
    if (!w || !w.strike || !w.size) return bot.sendMessage(chatId, 'Trade expired, start again with /up or /down.');
    const user = await ensureUser(q.from);
    const addr = getOrCreateKeypair(user).toSuiAddress();
    const bal = await getUsdcBalance(addr);
    if (bal < w.size) return bot.sendMessage(chatId, `You need *${w.size} dUSDC* but have *${bal.toFixed(2)}*. Tap /faucet to get testnet funds first.`, { parse_mode: 'Markdown', reply_markup: homeKb() });
    await bot.sendMessage(chatId, '⏳ Opening your position on-chain…');
    await ensurePredictManager(user);
    const tx = await mintBinary({
      user, direction: w.direction, oracleId: w.oracleId,
      strike: w.strike, expiryMs: w.expiryMs,
      quantity: w.size * 1_000_000, depositUsdc: w.size,
    });
    recordTrade({ tgId: user.tgId, direction: w.direction, strike: w.strike, sizeUsdc: w.size, txDigest: tx.digest });
    delete wiz[q.from.id];
    return bot.sendMessage(chatId, [
      '✅ *Position opened!*',
      `${w.direction === 'CALL' ? '📈 CALL' : '📉 PUT'} BTC *$${(w.strike / 1000).toFixed(0)}k* for *${w.size} dUSDC*`,
      `[view on-chain](${SUISCAN(tx.digest)})`,
    ].join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '📈 Trade again', callback_data: 'do_up' }]] } });
  }
}));

console.log('predict-tg-bot up (wizard + real faucet)');
