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
const FAUCET_SUI = 30_000_000n;   // 0.03 SUI for gas
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
  return { digest: r.digest, balance: await getUsdcBalance(addr), address: addr, sui: '0.03', usdc: '3' };
}
