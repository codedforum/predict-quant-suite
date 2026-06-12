import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { decryptKey, encryptKey } from './wallet.js';
import { saveKey, loadKey, savePredictManagerId, loadPredictManagerId, hasFauceted, markFauceted } from './db.js';

const RPC = process.env.SUI_RPC || getFullnodeUrl('testnet');
export const PREDICT_PKG = process.env.PREDICT_PKG || '0xCHANGE_ME';
export const PREDICT_OBJECT = process.env.PREDICT_OBJECT || '';
export const DUSDC_TYPE = process.env.DUSDC_TYPE || `${PREDICT_PKG}::dusdc::DUSDC`;

export const suiClient = new SuiClient({ url: RPC });

const FAUCET_KEY = process.env.FAUCET_KEY || '';
const PREDICT_API = process.env.PREDICT_API || 'https://predict-api.smartcodedbot.com';
const FAUCET_SUI = 120_000_000n;  // 0.12 SUI for gas (manager + binary/range mint + redeem; storage is largely rebated on redeem)
const FAUCET_USDC = 3_000_000n;   // 3 dUSDC to trade with
function treasuryKeypair() {
  if (!FAUCET_KEY) throw new Error('FAUCET_KEY not set');
  return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(FAUCET_KEY).secretKey);
}

export async function getUsdcBalance(addr) {
  const b = await suiClient.getBalance({ owner: addr, coinType: DUSDC_TYPE });
  return Number(b.totalBalance) / 1e6;
}

// Live primary Predict oracle from the API (oracleId, forward, expiry).
export async function fetchLiveOracle() {
  const r = await fetch(`${PREDICT_API}/api/surface`, { signal: AbortSignal.timeout(12000) });
  const d = await r.json();
  const p = d.primary || (d.oracles && d.oracles[0]);
  if (!p) throw new Error('no live oracle');
  return { oracleId: p.oracleId, forward: p.forward, expiryMs: p.expirySec * 1000, expirySec: p.expirySec };
}

const u64le = (b) => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; };
let _treAddr;
function treAddr() { if (!_treAddr) _treAddr = treasuryKeypair().toSuiAddress(); return _treAddr; }
// Quote a strike via get_trade_amounts (devInspect). Returns {cost,payout} per contract,
// or null if it is not mintable (out of the ask band). Used to only offer valid strikes.
export async function quoteStrike(oracleId, expiryMs, strike, direction) {
  const tx = new Transaction();
  const key = tx.moveCall({ target: `${PREDICT_PKG}::market_key::${direction === 'CALL' ? 'up' : 'down'}`, arguments: [tx.pure.id(oracleId), tx.pure.u64(BigInt(expiryMs)), tx.pure.u64(BigInt(Math.floor(strike * 1e9)))] });
  tx.moveCall({ target: `${PREDICT_PKG}::predict::get_trade_amounts`, arguments: [tx.object(PREDICT_OBJECT), tx.object(oracleId), key, tx.pure.u64(1_000_000n), tx.object('0x6')] });
  try {
    const r = await suiClient.devInspectTransactionBlock({ sender: treAddr(), transactionBlock: tx });
    if (r.error) return null;
    const rv = r.results?.[r.results.length - 1]?.returnValues;
    if (!rv || rv.length < 2) return null;
    return { cost: Number(u64le(rv[0][0])) / 1e6, payout: Number(u64le(rv[1][0])) / 1e6 };
  } catch { return null; }
}

// Quote a vertical-range (bounded) position via get_range_trade_amounts (devInspect).
// A range pays out if the price lands BETWEEN lowerStrike and higherStrike at expiry,
// i.e. a structured product / spread, composing the Predict primitive with itself.
export async function quoteRange(oracleId, expiryMs, lowerStrike, higherStrike, quantity = 1_000_000n) {
  const tx = new Transaction();
  const key = tx.moveCall({ target: `${PREDICT_PKG}::range_key::new`, arguments: [tx.pure.id(oracleId), tx.pure.u64(BigInt(expiryMs)), tx.pure.u64(BigInt(Math.floor(lowerStrike * 1e9))), tx.pure.u64(BigInt(Math.floor(higherStrike * 1e9)))] });
  tx.moveCall({ target: `${PREDICT_PKG}::predict::get_range_trade_amounts`, arguments: [tx.object(PREDICT_OBJECT), tx.object(oracleId), key, tx.pure.u64(BigInt(quantity)), tx.object('0x6')] });
  try {
    const r = await suiClient.devInspectTransactionBlock({ sender: treAddr(), transactionBlock: tx });
    if (r.error) return null;
    const rv = r.results?.[r.results.length - 1]?.returnValues;
    if (!rv || rv.length < 2) return null;
    return { cost: Number(u64le(rv[0][0])) / 1e6, payout: Number(u64le(rv[1][0])) / 1e6 };
  } catch { return null; }
}

export function getOrCreateKeypair(user) {
  const enc = loadKey(user.tgId);
  if (enc) return Ed25519Keypair.fromSecretKey(decryptKey(enc));
  const kp = new Ed25519Keypair();
  saveKey(user.tgId, encryptKey(kp.getSecretKey()));
  return kp;
}

// PredictManager is a shared object created via predict::create_manager(ctx) -> ID.
// First call returns an object-id; we persist it so the user reuses it forever.
export async function ensurePredictManager(user) {
  let mid = loadPredictManagerId(user.tgId);
  if (mid) return mid;
  const kp = getOrCreateKeypair(user);
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::create_manager`,
    arguments: [],
  });
  const r = await suiClient.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  // PredictManagerCreated event carries the manager_id
  const ev = (r.events || []).find((e) => String(e.type).endsWith('::predict_manager::PredictManagerCreated'));
  mid = ev?.parsedJson?.manager_id;
  if (!mid) {
    const created = (r.objectChanges || []).find((c) => c.type === 'created' && String(c.objectType).includes('PredictManager'));
    mid = created?.objectId;
  }
  if (mid) savePredictManagerId(user.tgId, mid);
  return mid;
}

// Real sponsored faucet: dUSDC has NO permissionless faucet on the Predict testnet,
// so the bot sponsors each user once from a treasury wallet. Sends BOTH gas SUI
// (fresh user wallets have none) and dUSDC, in one tx. One claim per user.
export async function faucetDusdc(user) {
  const kp = getOrCreateKeypair(user);
  const addr = kp.toSuiAddress();
  if (hasFauceted(user.tgId)) {
    return { already: true, balance: await getUsdcBalance(addr), address: addr };
  }
  const tre = treasuryKeypair();
  const treAddr = tre.toSuiAddress();
  const coins = await suiClient.getCoins({ owner: treAddr, coinType: DUSDC_TYPE });
  if (!coins.data.length) throw new Error('faucet treasury is out of dUSDC');

  const tx = new Transaction();
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(FAUCET_SUI)]);
  const dusdcSrc = coins.data[0].coinObjectId;
  if (coins.data.length > 1) tx.mergeCoins(tx.object(dusdcSrc), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
  const [usdcCoin] = tx.splitCoins(tx.object(dusdcSrc), [tx.pure.u64(FAUCET_USDC)]);
  tx.transferObjects([suiCoin, usdcCoin], tx.pure.address(addr));

  const r = await suiClient.signAndExecuteTransaction({ signer: tre, transaction: tx, options: { showEffects: true } });
  if (r.effects?.status?.status !== 'success') throw new Error('faucet tx failed: ' + JSON.stringify(r.effects?.status));
  markFauceted(user.tgId);
  try { await suiClient.waitForTransaction({ digest: r.digest, timeout: 8000 }); } catch (e) { /* balance fallback below */ }
  let balance = await getUsdcBalance(addr);
  if (balance < 3) balance = Number(FAUCET_USDC) / 1e6;   // index lag fallback: we just sent 3
  return { digest: r.digest, balance, address: addr, sui: '0.12', usdc: '3' };
}
