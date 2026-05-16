import { Transaction } from '@mysten/sui/transactions';
import { suiClient, getOrCreateKeypair, PREDICT_PKG, PREDICT_OBJECT, DUSDC_TYPE } from './sui.js';
import { loadPredictManagerId, recordPosition, openPositions, markRedeemed, userStats } from './db.js';

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

// Walk every open position for the user, call redeemOne on each.
// Errors per-position are caught so one bad redeem does not abort the batch.
// On success, the position is marked redeemed in the local DB with the payout.
export async function redeemAll(user) {
  const positions = openPositions(user.tgId);
  if (!positions.length) return { count: 0, payout: 0, failures: 0 };

  let payout = 0;
  let count = 0;
  let failures = 0;
  for (const p of positions) {
    try {
      const r = await redeemOne({
        user,
        oracleId: p.oracleId,
        expiry: p.expiry,
        strike: p.strike,
        isUp: !!p.isUp,
        quantity: p.quantity,
      });
      // r.payout is already in dUSDC (divided by 1e6 in redeemOne)
      const payoutRaw = Math.round((r.payout || 0) * 1_000_000);
      markRedeemed(p.id, payoutRaw);
      payout += r.payout || 0;
      count += 1;
    } catch (e) {
      console.warn(`[redeemAll] position ${p.id} failed:`, e.message);
      failures += 1;
    }
  }
  return { count, payout: Number(payout.toFixed(4)), failures };
}

// PnL summary for /pnl. Realized comes from the local DB (sum of payouts minus
// cost on redeemed positions). Equity = on-chain manager balance + estimated
// open exposure (cost basis; not mark-to-market — that needs SVI valuation).
export async function getManagerPnl(user) {
  const { realized, open, openCost } = userStats(user.tgId);
  let equity = 0;
  try {
    const bal = await getManagerBalance(user);
    equity = bal.balance + openCost;
  } catch (e) {
    console.warn('[getManagerPnl] balance lookup failed:', e.message);
    equity = openCost;
  }
  return {
    realized: Number(realized.toFixed(4)),
    open,
    equity: Number(equity.toFixed(4)),
  };
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
