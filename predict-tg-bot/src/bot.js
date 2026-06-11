import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { ensureUser, recordTrade, topUsers, openPositions, savePick, getUserPicks, settleMatch, wcLeaderboard } from './db.js';
import { mintBinary, redeemAll, getManagerPnl } from './predict.js';
import { faucetDusdc, ensurePredictManager, fetchLiveOracle, getUsdcBalance, getOrCreateKeypair } from './sui.js';

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
const homeKb = () => ({ inline_keyboard: [
  [{ text: '💧 Get testnet funds', callback_data: 'do_faucet' }],
  [{ text: '📈 Trade Up', callback_data: 'do_up' }, { text: '📉 Trade Down', callback_data: 'do_down' }],
  [{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '📋 Positions', callback_data: 'do_pos' }],
  [{ text: '💹 Prices', callback_data: 'do_price' }, { text: '🏆 Leaderboard', callback_data: 'do_lb' }],
  [{ text: '⚽ World Cup pick’em', callback_data: 'do_wc' }],
] });
const WELCOME = [
  '🔮 <b>Predict Quant Bot</b>',
  'Trade <b>DeepBook Predict</b> on Sui, the on-chain options market, right here in Telegram.',
  '',
  '<b>How it works</b>',
  '<b>1.</b> <code>/faucet</code>  get free testnet dUSDC and gas, one time',
  '<b>2.</b> <code>/up</code> or <code>/down</code>  open a BTC position in a few taps',
  '<b>3.</b> <code>/pnl</code>  track your positions and profit',
  '<b>4.</b> <code>/redeem</code>  claim settled payouts',
  '',
  '<i>Self custody. The bot creates a Sui wallet that you own, and everything settles on-chain.</i>',
  '',
  'Tap a button below to begin.',
].join('\n');
bot.onText(/^\/(start|help)/, (msg) => safe(msg.chat.id, async () => { await ensureUser(msg.from); await send(msg.chat.id, WELCOME, homeKb()); }));

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
  const base = Math.round(o.forward / 1000) * 1000;
  const rows = [base - 2000, base - 1000, base, base + 1000, base + 2000].map((s) => ([{ text: `$${(s / 1000).toFixed(0)}k`, callback_data: `w_strike:${s}` }]));
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
    `Realized PnL: <b>${realized >= 0 ? '+' : ''}${realized.toFixed(2)} dUSDC</b>`,
  ].join('\n'), { inline_keyboard: [[{ text: '📋 Positions', callback_data: 'do_pos' }, { text: '💰 Redeem', callback_data: 'do_redeem' }]] });
}
async function doPositions(chatId, from) {
  const user = await ensureUser(from);
  const pos = openPositions(user.tgId);
  if (!pos.length) return send(chatId, '📋 <b>No open positions.</b>\nOpen one with 📈 Trade Up or 📉 Trade Down.', homeKb());
  const lines = pos.map((p) => `${p.isUp ? '📈 CALL' : '📉 PUT'}  <b>$${(p.strike / 1e9 / 1000).toFixed(0)}k</b>  ·  cost <b>${(p.cost / 1e6).toFixed(2)}</b> dUSDC`);
  await send(chatId, `📋 <b>Open positions (${pos.length})</b>\n${lines.join('\n')}`, { inline_keyboard: [[{ text: '💰 Redeem settled', callback_data: 'do_redeem' }]] });
}
async function doRedeem(chatId, from) {
  const user = await ensureUser(from);
  await send(chatId, '💰 <i>Checking for settled positions…</i>');
  const r = await redeemAll(user);
  await send(chatId, r.count ? `✅ Redeemed <b>${r.count}</b> position(s) for <b>+${r.payout.toFixed(2)} dUSDC</b>.` : 'No settled positions yet. Positions settle at their expiry.', homeKb());
}
async function doPrice(chatId) {
  await send(chatId, '💹 <i>Fetching live prices…</i>');
  const ps = await fetchPrices();
  const lines = ps.map((p) => `<b>${p.sym}</b>  <code>${p.price != null ? fmtUsd(p.price) : '--'}</code>`);
  await send(chatId, `💹 <b>Live prices</b> <i>via Pyth</i>\n${lines.join('\n')}`, { inline_keyboard: [[{ text: '📈 Trade Up', callback_data: 'do_up' }, { text: '📉 Trade Down', callback_data: 'do_down' }]] });
}
async function doLeaderboard(chatId) {
  const rows = topUsers(10);
  const body = rows.length ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} @${esc(r.username || r.tgId)}  <b>${r.realized >= 0 ? '+' : ''}${r.realized.toFixed(2)}</b> dUSDC  <i>(${r.trades})</i>`).join('\n') : 'No trades yet. Be the first.';
  await send(chatId, `🏆 <b>Top traders</b> <i>(7d)</i>\n${body}`);
}
bot.onText(/^\/pnl/, (msg) => safe(msg.chat.id, () => doPnl(msg.chat.id, msg.from)));
bot.onText(/^\/positions/, (msg) => safe(msg.chat.id, () => doPositions(msg.chat.id, msg.from)));
bot.onText(/^\/redeem/, (msg) => safe(msg.chat.id, () => doRedeem(msg.chat.id, msg.from)));
bot.onText(/^\/price/, (msg) => safe(msg.chat.id, () => doPrice(msg.chat.id)));
bot.onText(/^\/leaderboard/, (msg) => safe(msg.chat.id, () => doLeaderboard(msg.chat.id)));

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
  if (data === 'do_wc') return doWorldCup(chatId, q.from);
  if (data === 'do_mypicks') return doMyPicks(chatId, q.from);
  if (data === 'do_wcb') return doWcBoard(chatId);
  if (data.startsWith('wc:')) {
    const [, eid, pick] = data.split(':');
    await ensureUser(q.from);
    savePick(q.from.id, eid, wcCache[eid]?.name || 'match', pick);
    return send(chatId, `✅ Pick saved: <b>${esc(pickLabel(eid, pick))}</b> for <b>${esc(wcCache[eid]?.name || 'the match')}</b>.\nAuto-settles when the match ends.`, { inline_keyboard: [[{ text: '📋 My picks', callback_data: 'do_mypicks' }, { text: '⚽ More', callback_data: 'do_wc' }]] });
  }

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
    const tx = await mintBinary({ user, direction: w.direction, oracleId: w.oracleId, strike: w.strike, expiryMs: w.expiryMs, quantity: w.size * 1_000_000, depositUsdc: w.size });
    recordTrade({ tgId: user.tgId, direction: w.direction, strike: w.strike, sizeUsdc: w.size, txDigest: tx.digest });
    delete wiz[q.from.id];
    return send(chatId, [
      '✅ <b>Position opened</b>',
      `${w.direction === 'CALL' ? '📈 CALL' : '📉 PUT'} BTC <b>$${(w.strike / 1000).toFixed(0)}k</b> for <b>${w.size} dUSDC</b>`,
      `<a href="${SUISCAN(tx.digest)}">view on-chain</a>`,
    ].join('\n'), { inline_keyboard: [[{ text: '📊 My PnL', callback_data: 'do_pnl' }, { text: '📈 Trade again', callback_data: 'do_up' }]] });
  }
}));

// ── World Cup pick'em (off-chain game, auto-settled from TheSportsDB free API) ──
const WC_API = 'https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026';
const wcCache = {};
async function fetchWcMatches() {
  const d = await (await fetch(WC_API, { signal: AbortSignal.timeout(12000) })).json();
  return (d.events || []).map((e) => {
    const m = {
      id: e.idEvent, name: e.strEvent, homeTeam: e.strHomeTeam || 'Home', awayTeam: e.strAwayTeam || 'Away',
      date: (e.dateEvent || '') + (e.strTime ? ' ' + String(e.strTime).slice(0, 5) + ' UTC' : ''),
      status: e.strStatus,
      home: e.intHomeScore != null ? parseInt(e.intHomeScore, 10) : null,
      away: e.intAwayScore != null ? parseInt(e.intAwayScore, 10) : null,
    };
    wcCache[m.id] = { name: m.name, home: m.homeTeam, away: m.awayTeam };
    return m;
  });
}
const pickLabel = (eid, pick) => { const c = wcCache[eid] || {}; return pick === 'HOME' ? (c.home || 'Home') : pick === 'AWAY' ? (c.away || 'Away') : 'Draw'; };
async function doWorldCup(chatId, from) {
  await ensureUser(from);
  await send(chatId, '⚽ <i>Loading World Cup fixtures…</i>');
  const up = (await fetchWcMatches()).filter((m) => m.status === 'NS').slice(0, 6);
  if (!up.length) return send(chatId, '⚽ <b>No upcoming World Cup matches right now.</b> Check back soon.', homeKb());
  await send(chatId, ['🏆 <b>World Cup pick’em</b>', 'Predict the result, correct picks earn <b>+3 points</b>, auto-settled when the match ends.', '', 'Pick below:'].join('\n'));
  for (const m of up) {
    await send(chatId, `<b>${esc(m.homeTeam)}</b> vs <b>${esc(m.awayTeam)}</b>\n<i>${esc(m.date)}</i>`, { inline_keyboard: [[
      { text: '🏠 ' + m.homeTeam.slice(0, 11), callback_data: `wc:${m.id}:HOME` },
      { text: '🤝 Draw', callback_data: `wc:${m.id}:DRAW` },
      { text: m.awayTeam.slice(0, 11) + ' ✈', callback_data: `wc:${m.id}:AWAY` },
    ]] });
  }
}
async function doMyPicks(chatId, from) {
  await ensureUser(from);
  const picks = getUserPicks(from.id);
  if (!picks.length) return send(chatId, '📋 <b>No World Cup picks yet.</b>\nTap ⚽ World Cup to predict.', homeKb());
  const lines = picks.map((p) => `${p.settled ? (p.correct ? '✅ +3' : '❌  0') : '⏳ open'}  <b>${esc(p.eventName)}</b>, pick: ${esc(pickLabel(p.eventId, p.pick))}`);
  await send(chatId, `📋 <b>Your World Cup picks</b>\n${lines.join('\n')}`, { inline_keyboard: [[{ text: '⚽ More matches', callback_data: 'do_wc' }, { text: '🏆 WC board', callback_data: 'do_wcb' }]] });
}
async function doWcBoard(chatId) {
  const rows = wcLeaderboard(10);
  const body = rows.length ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} @${esc(r.username || r.tgId)}  <b>${r.points} pts</b>  <i>(${r.picks})</i>`).join('\n') : 'No picks settled yet, be the first.';
  await send(chatId, `🏆 <b>World Cup leaderboard</b>\n${body}`);
}
let wcRunning = false;
async function settleWorldCup() {
  if (wcRunning) return; wcRunning = true;
  try {
    for (const m of await fetchWcMatches()) {
      if (m.status === 'FT' && m.home != null && m.away != null) {
        const result = m.home > m.away ? 'HOME' : m.away > m.home ? 'AWAY' : 'DRAW';
        const n = settleMatch(m.id, result);
        if (n) console.log(`[wc] settled ${n} pick(s) on ${m.name} -> ${result}`);
      }
    }
  } catch (e) { console.warn('[wc settle]', e?.message); } finally { wcRunning = false; }
}
bot.onText(/^\/worldcup/, (msg) => safe(msg.chat.id, () => doWorldCup(msg.chat.id, msg.from)));
bot.onText(/^\/mypicks/, (msg) => safe(msg.chat.id, () => doMyPicks(msg.chat.id, msg.from)));
bot.onText(/^\/wcboard/, (msg) => safe(msg.chat.id, () => doWcBoard(msg.chat.id)));
setInterval(settleWorldCup, 20 * 60 * 1000);
setTimeout(settleWorldCup, 8000);

console.log('predict-tg-bot up (HTML wizard, faucet, price, positions, world cup pickem)');
