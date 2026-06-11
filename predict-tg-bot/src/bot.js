import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { ensureUser, recordTrade, topUsers, openPositions } from './db.js';
import { mintBinary, redeemAll, getManagerPnl } from './predict.js';
import { faucetDusdc, ensurePredictManager, fetchLiveOracle, getUsdcBalance, getOrCreateKeypair, quoteStrike } from './sui.js';

const TOKEN = process.env.TG_TOKEN;
const looksLikeRealToken = (t) => typeof t === 'string' && /^(\d{8,12}):([A-Za-z0-9_-]{30,40})$/.test(t.trim());
if (!looksLikeRealToken(TOKEN)) { console.error('TG_TOKEN missing/invalid, exiting cleanly.'); process.exit(0); }

const bot = new TelegramBot(TOKEN, { polling: true });
const wiz = {};                                          // per-user trade draft (in memory)
const SUISCAN = (d) => `https://suiscan.xyz/testnet/tx/${d}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const send = (chatId, html, kb) => bot.sendMessage(chatId, html, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
const fmtUsd = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
function expiryIn(ms) {
  const s = Math.max(0, Math.floor((ms - Date.now()) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
async function safe(chatId, fn) {
  try { await fn(); } catch (e) { console.error('[handler]', e?.message); await send(chatId, `⚠️ <b>${esc(e?.message || 'Something went wrong, please try again.')}</b>`); }
}

// Pyth Hermes live prices (BTC, ETH, SOL)
const PYTH = 'https://hermes.pyth.network/v2/updates/price/latest';
const FEEDS = [
  { id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', sym: 'BTC', dp: 0 },
  { id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', sym: 'ETH', dp: 2 },
  { id: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', sym: 'SOL', dp: 2 },
  { id: '23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744', sym: 'SUI', dp: 4 },
];
async function fetchPrices() {
  const url = PYTH + '?parsed=true&' + FEEDS.map((f) => 'ids[]=' + f.id).join('&');
  const d = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json();
  const by = {}; (d.parsed || []).forEach((p) => { by[String(p.id).replace(/^0x/, '')] = p; });
  return FEEDS.map((f) => { const p = by[f.id]; const v = p ? Number(p.price.price) * Math.pow(10, p.price.expo) : null; return { sym: f.sym, price: v, dp: f.dp }; });
}

// ── home + welcome ──
// The web terminal (predict.smartcodedbot.com) and this bot share the SAME
// on-chain market and backend (predict-api.smartcodedbot.com). You analyze on
// the web, you trade here. webLink deep-links a user straight to their own
// positions in the web terminal's wallet lookup.
const SITE = 'https://predict.smartcodedbot.com';
const webLink = (addr) => (addr ? `${SITE}/?addr=${addr}#volarb` : `${SITE}#volarb`);
const homeKb = () => ({ inline_keyboard: [
  [{ text: '💧 Get testnet funds', callback_data: 'do_faucet' }],
  [{ text: '📈 Trade Up', callback_data: 'do_up' }, { text: '📉 Trade Down', callback_data: 'do_down' }],
  [{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '📋 Positions', callback_data: 'do_pos' }],
  [{ text: '💹 Prices', callback_data: 'do_price' }, { text: '🏆 Leaderboard', callback_data: 'do_lb' }],
  [{ text: '🌐 Web terminal', url: SITE }],
] });
const WELCOME = [
  '🔮 <b>Predict Quant Bot</b>',
  'Trade <b>DeepBook Predict</b> on Sui, the on-chain options market, right here in Telegram.',
  '',
  '<b>How it works</b>',
  '<b>1.</b> <code>/faucet</code>  get free testnet dUSDC and gas, one time',
  '<b>2.</b> <code>/up</code> or <code>/down</code>  open a BTC position in a few taps',
  '<b>3.</b> <code>/pnl</code>  track your positions and profit',
  '<b>4.</b> <code>/redeem</code>  cash out settled payouts to your wallet',
  '',
  '🌐 <b>Web terminal:</b> the live 3D volatility surface and analytics for this exact market live at predict.smartcodedbot.com. Same on-chain oracle, you trade here and analyze there.',
  '',
  '<i>Self custody. The bot creates a Sui wallet that you own, and everything settles on-chain.</i>',
  '',
  'Tap a button below to begin, or <code>/help</code> for the full guide.',
].join('\n');
const HELP = [
  'ℹ️ <b>Predict Quant Bot, full guide</b>',
  '',
  '<b>The market</b>',
  'DeepBook Predict is an on-chain options market on Sui. Each market is a BTC binary: pick a strike and a direction, and you win if BTC finishes on your side at expiry. Pricing comes from a live on-chain oracle.',
  '',
  '<b>Commands</b>',
  '<code>/faucet</code>  one-time testnet funds, 3 dUSDC and gas',
  '<code>/up</code>  bet BTC finishes <b>above</b> a strike (CALL)',
  '<code>/down</code>  bet BTC finishes <b>below</b> a strike (PUT)',
  '<code>/positions</code>  your open positions and time to expiry',
  '<code>/redeem</code>  settle and sweep payouts to your wallet',
  '<code>/pnl</code>  wallet balance, equity and realized PnL',
  '<code>/price</code>  live BTC, ETH, SOL and SUI prices',
  '<code>/leaderboard</code>  top traders this week',
  '<code>/export</code>  export your wallet private key',
  '',
  '<b>Your wallet</b>',
  'On first use the bot creates a Sui wallet only you control. Use <code>/export</code> to import it into Slush or the Sui Wallet anytime. Self custody, always.',
  '',
  '<b>The web terminal</b>',
  'predict.smartcodedbot.com is the analytics companion to this bot. It reads the same on-chain market: a live 3D volatility surface, a vol-arb keeper, and a wallet lookup that shows your own positions. Open <code>/pnl</code> and tap "View on web terminal" to jump straight to yours.',
].join('\n');
bot.onText(/^\/start/, (msg) => safe(msg.chat.id, async () => { await ensureUser(msg.from); await send(msg.chat.id, WELCOME, homeKb()); }));
bot.onText(/^\/help/, (msg) => safe(msg.chat.id, async () => { await ensureUser(msg.from); await send(msg.chat.id, HELP, homeKb()); }));

// ── /faucet ──
async function doFaucet(chatId, from) {
  const user = await ensureUser(from);
  await send(chatId, '💧 <i>Sending testnet funds…</i>');
  const r = await faucetDusdc(user);
  if (r.already) return send(chatId, `✅ <b>Already claimed.</b>\nWallet balance: <b>${r.balance.toFixed(2)} dUSDC</b>\n\nReady to trade.`, homeKb());
  return send(chatId, [
    '💧 <b>Funded</b>',
    'Sent <b>3 dUSDC</b> to trade and <b>0.03 SUI</b> for gas to your wallet.',
    `Balance: <b>${r.balance.toFixed(2)} dUSDC</b>`,
    `<a href="${SUISCAN(r.digest)}">view transaction</a>`,
    '',
    'Now open a position.',
  ].join('\n'), homeKb());
}
bot.onText(/^\/faucet/, (msg) => safe(msg.chat.id, () => doFaucet(msg.chat.id, msg.from)));

// ── trade wizard ──
async function startTrade(chatId, from, direction) {
  await ensureUser(from);
  await send(chatId, `${direction === 'CALL' ? '📈' : '📉'} <i>Loading the live BTC market…</i>`);
  const o = await fetchLiveOracle();
  wiz[from.id] = { direction, oracleId: o.oracleId, expiryMs: o.expiryMs, forward: o.forward };
  const base = Math.round(o.forward / 500) * 500;
  const candidates = [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000].map((d) => base + d);
  const quoted = await Promise.all(candidates.map((s) => quoteStrike(o.oracleId, o.expiryMs, s, direction).then((q) => ({ s, q }))));
  let mintable = quoted.filter((x) => x.q && x.q.cost > 0.04 && x.q.cost < 0.96).map((x) => x.s);
  if (!mintable.length) return send(chatId, '⚠️ <b>This market is not openable right now</b> (too close to expiry). Please try again shortly.', homeKb());
  if (mintable.length > 5) { const step = (mintable.length - 1) / 4; mintable = [0, 1, 2, 3, 4].map((i) => mintable[Math.round(i * step)]); }
  const rows = mintable.map((s) => ([{ text: `$${(s / 1000).toFixed(1)}k`, callback_data: `w_strike:${s}` }]));
  await send(chatId, [
    `${direction === 'CALL' ? '📈 <b>Trade Up</b> (CALL)' : '📉 <b>Trade Down</b> (PUT)'} on <b>BTC</b>`,
    `Forward <b>${fmtUsd(o.forward)}</b>, settles in <b>${expiryIn(o.expiryMs)}</b>`,
    '',
    direction === 'CALL' ? 'You win if BTC is <b>above</b> your strike at expiry. Pick a strike.' : 'You win if BTC is <b>below</b> your strike at expiry. Pick a strike.',
  ].join('\n'), { inline_keyboard: rows });
}
bot.onText(/^\/up/, (msg) => safe(msg.chat.id, () => startTrade(msg.chat.id, msg.from, 'CALL')));
bot.onText(/^\/down/, (msg) => safe(msg.chat.id, () => startTrade(msg.chat.id, msg.from, 'PUT')));

// ── /pnl /positions /redeem /price /leaderboard ──
async function doPnl(chatId, from) {
  const user = await ensureUser(from);
  const addr = getOrCreateKeypair(user).toSuiAddress();
  const [{ realized, open, equity }, bal] = await Promise.all([getManagerPnl(user), getUsdcBalance(addr)]);
  await send(chatId, [
    '📊 <b>Your account</b>',
    `Wallet balance: <b>${bal.toFixed(2)} dUSDC</b>`,
    `In-protocol equity: <b>${equity.toFixed(2)} dUSDC</b>`,
    `Open positions: <b>${open}</b>`,
    `Realized PnL: <b>${realized.toFixed(2)} dUSDC</b>`,
  ].join('\n'), { inline_keyboard: [
    [{ text: '📋 Positions', callback_data: 'do_pos' }, { text: '💰 Redeem', callback_data: 'do_redeem' }],
    [{ text: '🌐 View on web terminal', url: webLink(addr) }],
    [{ text: '🔑 Export wallet', callback_data: 'do_export' }],
  ] });
}
async function doPositions(chatId, from) {
  const user = await ensureUser(from);
  const addr = getOrCreateKeypair(user).toSuiAddress();
  const pos = openPositions(user.tgId);
  if (!pos.length) return send(chatId, '📋 <b>No open positions.</b>\nOpen one with 📈 Trade Up or 📉 Trade Down.', homeKb());
  const lines = pos.map((p) => `${p.isUp ? '📈 CALL' : '📉 PUT'}  <b>$${(p.strike / 1e9 / 1000).toFixed(0)}k</b>  ·  cost <b>${(p.cost / 1e6).toFixed(2)}</b> dUSDC  ·  settles in <b>${expiryIn(p.expiry)}</b>`);
  await send(chatId, `📋 <b>Open positions (${pos.length})</b>\n${lines.join('\n')}`, { inline_keyboard: [
    [{ text: '💰 Redeem settled', callback_data: 'do_redeem' }],
    [{ text: '🌐 View on web terminal', url: webLink(addr) }],
  ] });
}
async function doRedeem(chatId, from) {
  const user = await ensureUser(from);
  await send(chatId, '💰 <i>Checking for settled positions…</i>');
  const r = await redeemAll(user);
  let msg;
  if (r.count) {
    msg = [
      `✅ Redeemed <b>${r.count}</b> position(s) for <b>${r.payout.toFixed(2)} dUSDC</b>.`,
      r.withdrawn > 0 ? `\n💸 <b>${r.withdrawn.toFixed(2)} dUSDC</b> sent to your wallet. Check /start to see your balance.` : '',
    ].join('');
  } else if (r.withdrawn > 0) {
    msg = `💸 <b>${r.withdrawn.toFixed(2)} dUSDC</b> from your earlier redeem has been sent to your wallet. Check /start to see your balance.`;
  } else {
    msg = 'No settled positions yet. Positions settle at their expiry.';
  }
  await send(chatId, msg, homeKb());
}
async function doPrice(chatId) {
  await send(chatId, '💹 <i>Fetching live prices…</i>');
  const ps = await fetchPrices();
  const lines = ps.map((p) => `<b>${p.sym}</b>  <code>${p.price != null ? fmtUsd(p.price) : '--'}</code>`);
  await send(chatId, `💹 <b>Live prices</b> <i>via Pyth</i>\n${lines.join('\n')}`, { inline_keyboard: [[{ text: '📈 Trade Up', callback_data: 'do_up' }, { text: '📉 Trade Down', callback_data: 'do_down' }]] });
}
async function doLeaderboard(chatId) {
  const rows = topUsers(10);
  const body = rows.length ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} @${esc(r.username || r.tgId)}  <b>${r.realized.toFixed(2)}</b> dUSDC  <i>(${r.trades} trades)</i>`).join('\n') : 'No trades yet. Be the first.';
  await send(chatId, `🏆 <b>Top traders</b> <i>(7d)</i>\n${body}`);
}
bot.onText(/^\/pnl/, (msg) => safe(msg.chat.id, () => doPnl(msg.chat.id, msg.from)));
bot.onText(/^\/positions/, (msg) => safe(msg.chat.id, () => doPositions(msg.chat.id, msg.from)));
bot.onText(/^\/redeem/, (msg) => safe(msg.chat.id, () => doRedeem(msg.chat.id, msg.from)));
bot.onText(/^\/price/, (msg) => safe(msg.chat.id, () => doPrice(msg.chat.id)));
bot.onText(/^\/leaderboard/, (msg) => safe(msg.chat.id, () => doLeaderboard(msg.chat.id)));

async function doExport(chatId, from, chatType) {
  if (chatType && chatType !== 'private') return send(chatId, '🔒 For your security, use Export in a direct chat with the bot, not in a group.');
  const user = await ensureUser(from);
  const kp = getOrCreateKeypair(user);
  await send(chatId, [
    '🔑 <b>Export your wallet</b>',
    `Address: <code>${kp.toSuiAddress()}</code>`,
    '',
    'Private key (Sui suiprivkey format):',
    `<code>${esc(kp.getSecretKey())}</code>`,
    '',
    '⚠️ <b>Anyone with this key controls your wallet.</b> Never share it or paste it anywhere. Import it into Slush or the Sui Wallet to take full self custody of your funds.',
  ].join('\n'));
}
bot.onText(/^\/export/, (msg) => safe(msg.chat.id, () => doExport(msg.chat.id, msg.from, msg.chat.type)));

// ── callbacks ──
bot.on('callback_query', (q) => safe(q.message.chat.id, async () => {
  const chatId = q.message.chat.id, data = q.data || '';
  await bot.answerCallbackQuery(q.id).catch(() => {});
  if (data === 'do_faucet') return doFaucet(chatId, q.from);
  if (data === 'do_up') return startTrade(chatId, q.from, 'CALL');
  if (data === 'do_down') return startTrade(chatId, q.from, 'PUT');
  if (data === 'do_pnl') return doPnl(chatId, q.from);
  if (data === 'do_pos') return doPositions(chatId, q.from);
  if (data === 'do_redeem') return doRedeem(chatId, q.from);
  if (data === 'do_price') return doPrice(chatId);
  if (data === 'do_lb') return doLeaderboard(chatId);
  if (data === 'do_export') return doExport(chatId, q.from, q.message.chat.type);

  const w = wiz[q.from.id];
  if (data.startsWith('w_strike:')) {
    if (!w) return send(chatId, 'Trade expired, start again with /up or /down.');
    w.strike = parseInt(data.split(':')[1], 10);
    return send(chatId, `Strike <b>$${(w.strike / 1000).toFixed(0)}k</b> selected.\nHow much dUSDC to commit?`, { inline_keyboard: [[1, 2, 3].map((s) => ({ text: `${s} dUSDC`, callback_data: `w_size:${s}` }))] });
  }
  if (data.startsWith('w_size:')) {
    if (!w || !w.strike) return send(chatId, 'Trade expired, start again with /up or /down.');
    w.size = parseInt(data.split(':')[1], 10);
    return send(chatId, [
      '<b>Confirm your trade</b>',
      `${w.direction === 'CALL' ? '📈 CALL (up)' : '📉 PUT (down)'} BTC`,
      `Strike: <b>$${(w.strike / 1000).toFixed(0)}k</b>`,
      `Size: <b>${w.size} dUSDC</b>`,
      `Settles in: <b>${expiryIn(w.expiryMs)}</b>`,
    ].join('\n'), { inline_keyboard: [[{ text: '✅ Confirm', callback_data: 'w_go' }, { text: '✖ Cancel', callback_data: 'w_cancel' }]] });
  }
  if (data === 'w_cancel') { delete wiz[q.from.id]; return send(chatId, 'Cancelled.', homeKb()); }
  if (data === 'w_go') {
    if (!w || !w.strike || !w.size) return send(chatId, 'Trade expired, start again with /up or /down.');
    const user = await ensureUser(q.from);
    const addr = getOrCreateKeypair(user).toSuiAddress();
    const bal = await getUsdcBalance(addr);
    if (bal < w.size) return send(chatId, `You need <b>${w.size} dUSDC</b> but have <b>${bal.toFixed(2)}</b>. Tap 💧 Get testnet funds first.`, homeKb());
    await send(chatId, '⏳ <i>Opening your position on-chain…</i>');
    await ensurePredictManager(user);
    let tx;
    try {
      tx = await mintBinary({ user, direction: w.direction, oracleId: w.oracleId, strike: w.strike, expiryMs: w.expiryMs, quantity: w.size * 1_000_000, depositUsdc: w.size });
    } catch (e) {
      console.error('[mint]', e?.message);
      return send(chatId, '⚠️ <b>Could not open the position.</b> The market may have moved or is near expiry. Please try /up or /down again.', homeKb());
    }
    recordTrade({ tgId: user.tgId, direction: w.direction, strike: w.strike, sizeUsdc: w.size, txDigest: tx.digest });
    delete wiz[q.from.id];
    return send(chatId, [
      '✅ <b>Position opened</b>',
      `${w.direction === 'CALL' ? '📈 CALL' : '📉 PUT'} BTC <b>$${(w.strike / 1000).toFixed(0)}k</b> for <b>${w.size} dUSDC</b>`,
      `<a href="${SUISCAN(tx.digest)}">view on-chain</a>`,
    ].join('\n'), { inline_keyboard: [
      [{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '📈 Trade again', callback_data: 'do_up' }],
      [{ text: '🌐 View on web terminal', url: webLink(addr) }],
    ] });
  }
}));

console.log('predict-tg-bot up (HTML wizard, faucet, trade, positions, redeem, prices, leaderboard)');
