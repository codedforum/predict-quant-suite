import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decryptKey, encryptKey } from './wallet.js';
import { saveKey, loadKey, savePredictManagerId, loadPredictManagerId } from './db.js';

const RPC = process.env.SUI_RPC || getFullnodeUrl('testnet');
export const PREDICT_PKG = process.env.PREDICT_PKG || '0xCHANGE_ME';
export const PREDICT_OBJECT = process.env.PREDICT_OBJECT || '';
export const DUSDC_TYPE = process.env.DUSDC_TYPE || `${PREDICT_PKG}::dusdc::DUSDC`;

export const suiClient = new SuiClient({ url: RPC });

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

export async function faucetDusdc(user, amount) {
  // Real impl pending: dUSDC is delivered by the Mysten team via the Tally form
  // (https://tally.so/r/Xx102L) - there's no permissionless faucet endpoint.
  // The bot can either (a) let users request via the form themselves,
  // or (b) sponsor first-trade dUSDC out of the bot's own balance.
  const kp = getOrCreateKeypair(user);
  return { amount, balance: amount, address: kp.toSuiAddress() };
}
