import { Transaction } from '@mysten/sui/transactions';
import { suiClient, getOrCreateKeypair, PREDICT_PKG, PREDICT_OBJECT, DUSDC_TYPE } from './sui.js';
import { loadPredictManagerId, recordPosition } from './db.js';

const FLOAT_SCALING = 1_000_000_000n; // 1e9 - dUSDC has 6 decimals but Predict prices use 1e9

// Buy a binary CALL (is_up=true) or PUT (is_up=false) position.
// Flow: deposit funds into the manager first, then mint draws cost from manager balance.
export async function mintBinary({ user, direction, oracleId, strike, expiryMs, quantity, depositUsdc }) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) throw new Error('manager missing - call ensurePredictManager first');
  if (!PREDICT_OBJECT) throw new Error('PREDICT_OBJECT env var (shared Predict object id) not set');

  const tx = new Transaction();

  if (depositUsdc && depositUsdc > 0) {
    const depositRaw = BigInt(Math.floor(depositUsdc * 1_000_000)); // dUSDC = 6 decimals
    const [topUp] = tx.splitCoins(tx.gas, [tx.pure.u64(depositRaw)]);
    tx.moveCall({
      target: `${PREDICT_PKG}::predict_manager::deposit`,
      arguments: [tx.object(managerId), topUp],
      typeArguments: [DUSDC_TYPE],
    });
  }

  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::${direction === 'CALL' ? 'up' : 'down'}`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(BigInt(expiryMs)),
      tx.pure.u64(BigInt(Math.floor(strike * 1e9))),
    ],
  });

  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(managerId),
      tx.object(oracleId),
      key,
      tx.pure.u64(BigInt(quantity)),
      tx.object('0x6'),
    ],
    typeArguments: [DUSDC_TYPE],
  });

  const r = await suiClient.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  const minted = (r.events || []).find((e) => String(e.type).endsWith('::predict::PositionMinted'));
  const pos = minted?.parsedJson;
  if (pos) {
    recordPosition({
      tgId: user.tgId,
      oracleId: pos.oracle_id,
      expiry: pos.expiry,
      strike: pos.strike,
      isUp: pos.is_up,
      quantity: pos.quantity,
      cost: pos.cost,
      tx: r.digest,
    });
  }
  return { digest: r.digest, position: pos };
}

// Redeem one position. Predict has no batch redeem - we walk our DB.
export async function redeemOne({ user, oracleId, expiry, strike, isUp, quantity }) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  const tx = new Transaction();

  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(BigInt(expiry)),
      tx.pure.u64(BigInt(strike)),
      tx.pure.bool(isUp),
    ],
  });

  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem`,
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(managerId),
      tx.object(oracleId),
      key,
      tx.pure.u64(BigInt(quantity)),
      tx.object('0x6'),
    ],
    typeArguments: [DUSDC_TYPE],
  });

  const r = await suiClient.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  const ev = (r.events || []).find((e) => String(e.type).endsWith('::predict::PositionRedeemed'));
  return { digest: r.digest, payout: Number(ev?.parsedJson?.payout ?? 0) / 1e6 };
}

export async function getManagerBalance(user) {
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) return { balance: 0 };
  const obj = await suiClient.getObject({ id: managerId, options: { showContent: true } });
  // PredictManager wraps a balance_manager - exact field traversal depends on the deepbook version.
  // For now read the manager's reported balance via the balance helper view.
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::balance`,
    arguments: [tx.object(managerId)],
    typeArguments: [DUSDC_TYPE],
  });
  const r = await suiClient.devInspectTransactionBlock({ sender: '0x0', transactionBlock: tx });
  const raw = r.results?.[0]?.returnValues?.[0]?.[0]?.[0] ?? 0;
  return { balance: Number(raw) / 1e6 };
}
