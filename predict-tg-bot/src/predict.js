import { Transaction } from '@mysten/sui/transactions';
import { suiClient, getOrCreateKeypair, PREDICT_PKG, DUSDC_TYPE } from './sui.js';
import { loadPredictManagerId } from './db.js';

export async function mintBinary({ user, direction, strike, windowMs, sizeUsdc }) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) throw new Error('manager missing - call ensurePredictManager first');

  const expiryMs = Date.now() + windowMs;
  const tx = new Transaction();
  const sizeRaw = BigInt(Math.floor(sizeUsdc * 1e6));
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(sizeRaw)]);

  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint_binary`,
    arguments: [
      tx.object(managerId),
      tx.pure.u64(BigInt(Math.floor(strike * 1e6))),
      tx.pure.u64(BigInt(expiryMs)),
      tx.pure.u8(direction === 'CALL' ? 0 : 1),
      coin,
    ],
    typeArguments: [DUSDC_TYPE],
  });

  const r = await suiClient.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  const created = (r.objectChanges || []).find((c) => c.type === 'created' && String(c.objectType).includes('Position'));
  return { digest: r.digest, positionId: created?.objectId };
}

export async function redeemAll(user, positionId) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_all`,
    arguments: [tx.object(managerId)],
    typeArguments: [DUSDC_TYPE],
  });
  const r = await suiClient.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  let payout = 0;
  let count = 0;
  for (const ev of r.events || []) {
    if (String(ev.type).includes('Redeemed')) {
      payout += Number(ev.parsedJson?.payout ?? 0) / 1e6;
      count += 1;
    }
  }
  return { count, payout, digest: r.digest };
}

export async function getManagerPnl(user) {
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) return { realized: 0, open: 0, equity: 0 };
  const obj = await suiClient.getObject({ id: managerId, options: { showContent: true } });
  const fields = obj.data?.content?.fields ?? {};
  return {
    realized: Number(fields.realized ?? 0) / 1e6,
    open: Number(fields.open_count ?? 0),
    equity: Number(fields.balance ?? 0) / 1e6,
  };
}
