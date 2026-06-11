// One-off: register the bot command menu + descriptions. Run after deploy.
// Reads TG_TOKEN from .env. Safe to re-run.
import 'dotenv/config';
const T = process.env.TG_TOKEN;
if (!T) { console.error('TG_TOKEN missing'); process.exit(1); }
const api = (m, body) => fetch(`https://api.telegram.org/bot${T}/${m}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

const commands = [
  { command: 'start', description: '🏠 Home, your wallet and balance' },
  { command: 'faucet', description: '💧 Get free testnet dUSDC and gas, one time' },
  { command: 'up', description: '📈 Bet BTC finishes above a strike' },
  { command: 'down', description: '📉 Bet BTC finishes below a strike' },
  { command: 'positions', description: '📋 Your open positions' },
  { command: 'redeem', description: '💰 Redeem and cash out positions' },
  { command: 'pnl', description: '📊 Your profit and loss' },
  { command: 'price', description: '🔮 Live BTC, ETH, SOL, SUI prices' },
  { command: 'leaderboard', description: '🏆 Top traders this week' },
  { command: 'worldcup', description: '⚽ World Cup pick em game' },
  { command: 'mypicks', description: '🎟 Your World Cup picks' },
  { command: 'wcboard', description: '🥇 World Cup pick em leaderboard' },
  { command: 'export', description: '🔑 Export your wallet private key' },
  { command: 'help', description: 'ℹ️ How it all works' },
];

const short = 'On-chain BTC up or down options on Sui testnet, plus a World Cup pick em game. Your own self custody wallet.';
const about = [
  'Predict on-chain with DeepBook Predict on Sui testnet.',
  '',
  'Tap up or down on BTC, mint a real position, redeem for profit. Every bot user gets a self custody wallet and a one time faucet of testnet dUSDC and gas.',
  '',
  'Bonus: a World Cup pick em points game, auto settled when each match ends.',
  '',
  'Built for Sui Overflow 2026 by SmartCodedBot.',
].join('\n');

console.log('setMyCommands', (await api('setMyCommands', { commands })).ok);
console.log('setMyShortDescription', (await api('setMyShortDescription', { short_description: short })).ok);
console.log('setMyDescription', (await api('setMyDescription', { description: about })).ok);
