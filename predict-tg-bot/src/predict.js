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
    // dUSDC is a separate coin type, NOT the SUI gas coin - split from a real dUSDC
    // object (verified live 2026-06-11: tx.gas here aborts; deposit must come from dUSDC).
    const coins = await suiClient.getCoins({ owner: kp.toSuiAddress(), coinType: DUSDC_TYPE });
    if (!coins.data.length) throw new Error('no dUSDC balance to deposit - fund the wallet first');
    const primary = coins.data[0].coinObjectId;
    if (coins.data.length > 1) {
      tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [topUp] = tx.splitCoins(tx.object(primary), [tx.pure.u64(depositRaw)]);
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

// Mint a vertical-RANGE (bounded) position: pays out if the price lands BETWEEN
// lowerStrike and higherStrike at expiry. This is a structured product / spread,
// composing the Predict primitive with itself (predict::mint_range + range_key).
export async function mintRange({ user, oracleId, lowerStrike, higherStrike, expiryMs, quantity, depositUsdc }) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) throw new Error('manager missing - call ensurePredictManager first');
  if (!PREDICT_OBJECT) throw new Error('PREDICT_OBJECT env var not set');

  const tx = new Transaction();
  if (depositUsdc && depositUsdc > 0) {
    const depositRaw = BigInt(Math.floor(depositUsdc * 1_000_000));
    const coins = await suiClient.getCoins({ owner: kp.toSuiAddress(), coinType: DUSDC_TYPE });
    if (!coins.data.length) throw new Error('no dUSDC balance to deposit - fund the wallet first');
    const primary = coins.data[0].coinObjectId;
    if (coins.data.length > 1) tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    const [topUp] = tx.splitCoins(tx.object(primary), [tx.pure.u64(depositRaw)]);
    tx.moveCall({ target: `${PREDICT_PKG}::predict_manager::deposit`, arguments: [tx.object(managerId), topUp], typeArguments: [DUSDC_TYPE] });
  }

  const key = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(BigInt(expiryMs)), tx.pure.u64(BigInt(Math.floor(lowerStrike * 1e9))), tx.pure.u64(BigInt(Math.floor(higherStrike * 1e9)))],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint_range`,
    arguments: [tx.object(PREDICT_OBJECT), tx.object(managerId), tx.object(oracleId), key, tx.pure.u64(BigInt(quantity)), tx.object('0x6')],
    typeArguments: [DUSDC_TYPE],
  });

  const r = await suiClient.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true, showEvents: true } });
  if (r.effects?.status?.status !== 'success') throw new Error('mint_range failed: ' + JSON.stringify(r.effects?.status));
  const ev = (r.events || []).find((e) => String(e.type).endsWith('::predict::RangeMinted'));
  const pos = ev?.parsedJson;
  recordPosition({
    tgId: user.tgId, kind: 'range', oracleId,
    expiry: pos?.expiry ?? expiryMs,
    lowerStrike: pos?.lower_strike ?? Math.floor(lowerStrike * 1e9),
    higherStrike: pos?.higher_strike ?? Math.floor(higherStrike * 1e9),
    quantity: pos?.quantity ?? quantity, cost: pos?.cost ?? 0, tx: r.digest,
  });
  return { digest: r.digest, position: pos };
}

// Redeem a single range position (range_key + predict::redeem_range).
async function redeemRangeOne({ user, oracleId, expiry, lowerStrike, higherStrike, quantity }) {
  const kp = getOrCreateKeypair(user);
  const managerId = loadPredictManagerId(user.tgId);
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(BigInt(expiry)), tx.pure.u64(BigInt(lowerStrike)), tx.pure.u64(BigInt(higherStrike))],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_range`,
    arguments: [tx.object(PREDICT_OBJECT), tx.object(managerId), tx.object(oracleId), key, tx.pure.u64(BigInt(quantity)), tx.object('0x6')],
    typeArguments: [DUSDC_TYPE],
  });
  const r = await suiClient.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true, showEvents: true } });
  const ev = (r.events || []).find((e) => String(e.type).endsWith('::predict::RangeRedeemed'));
  const bid = Number(ev?.parsedJson?.bid_price ?? 0);          // per-contract bid, 1e9 scale
  const payout = (bid / 1e9) * (Number(quantity) / 1_000_000);
  return { digest: r.digest, payout };
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

// Read the manager's raw free balance (u64) as a BigInt. The devInspect sender
// must be a real address (this RPC rejects '0x0' with InvalidParams).
async function managerBalanceRaw(managerId, sender) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::balance`,
    arguments: [tx.object(managerId)],
    typeArguments: [DUSDC_TYPE],
  });
  const r = await suiClient.devInspectTransactionBlock({ sender, transactionBlock: tx });
  const bytes = r.results?.[0]?.returnValues?.[0]?.[0];
  if (!bytes || !bytes.length) return 0n;
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

// Sweep the manager's entire free balance (redeem payouts + any leftover deposit)
// back to the user's own wallet as a dUSDC coin. predict::redeem credits the
// payout INTO the manager, so without this the user never sees the dUSDC.
export async function withdrawManager(user) {
  const kp = getOrCreateKeypair(user);
  const addr = kp.toSuiAddress();
  const managerId = loadPredictManagerId(user.tgId);
  if (!managerId) return { withdrawn: 0 };
  const raw = await managerBalanceRaw(managerId, addr);
  if (raw <= 0n) return { withdrawn: 0 };
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::withdraw`,
    arguments: [tx.object(managerId), tx.pure.u64(raw)],
    typeArguments: [DUSDC_TYPE],
  });
  tx.transferObjects([coin], tx.pure.address(kp.toSuiAddress()));
  const r = await suiClient.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
  if (r.effects?.status?.status !== 'success') throw new Error('withdraw failed: ' + JSON.stringify(r.effects?.status));
  return { withdrawn: Number(raw) / 1e6, digest: r.digest };
}

// Walk every open position for the user, call redeemOne on each, then sweep the
// manager's free balance back to the wallet. The sweep runs ALWAYS (even with no
// open positions) so funds from any earlier redeem that got stuck in the manager
// are rescued the next time the user taps redeem.
export async function redeemAll(user) {
  const positions = openPositions(user.tgId);

  let payout = 0;
  let count = 0;
  let failures = 0;
  for (const p of positions) {
    try {
      const r = p.kind === 'range'
        ? await redeemRangeOne({ user, oracleId: p.oracleId, expiry: p.expiry, lowerStrike: p.lowerStrike, higherStrike: p.higherStrike, quantity: p.quantity })
        : await redeemOne({ user, oracleId: p.oracleId, expiry: p.expiry, strike: p.strike, isUp: !!p.isUp, quantity: p.quantity });
      // r.payout is already in dUSDC
      const payoutRaw = Math.round((r.payout || 0) * 1_000_000);
      markRedeemed(p.id, payoutRaw);
      payout += r.payout || 0;
      count += 1;
    } catch (e) {
      console.warn(`[redeemAll] position ${p.id} failed:`, e.message);
      failures += 1;
    }
  }

  let withdrawn = 0;
  try {
    withdrawn = (await withdrawManager(user)).withdrawn;
  } catch (e) {
    console.warn('[redeemAll] manager sweep failed:', e.message);
  }
  return { count, payout: Number(payout.toFixed(4)), failures, withdrawn: Number(withdrawn.toFixed(4)) };
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
  const addr = getOrCreateKeypair(user).toSuiAddress();
  const raw = await managerBalanceRaw(managerId, addr);
  return { balance: Number(raw) / 1e6 };
}
