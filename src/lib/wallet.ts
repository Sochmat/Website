import { Db, ObjectId } from "mongodb";
import { REFERRAL_REWARD } from "./walletMath";
import type { WalletTransaction } from "./types";

const USERS = "users";
const LEDGER = "walletTransactions";

function ledgerEntry(
  e: Omit<WalletTransaction, "createdAt">,
): WalletTransaction {
  return { ...e, createdAt: new Date() };
}

export async function getWalletBalance(
  db: Db,
  userId: ObjectId,
): Promise<number> {
  const user = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { walletBalance: 1 } });
  return Number(user?.walletBalance ?? 0);
}

/**
 * Atomically hold `amount` from the user's balance for an order. Guarded on
 * sufficient balance so it can't go negative or double-spend across concurrent
 * checkouts. Returns false (and reserves nothing) if the balance moved underneath.
 */
export async function reserveWallet(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const res = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount }, $set: { updatedAt: new Date() } },
    );
  if (res.matchedCount === 0) return false;
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "reserved", amount }));
  return true;
}

/** Reserved → spent. The balance was already decremented at reserve time. */
export async function settleWallet(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "spent", amount }));
}

/**
 * Return a reservation to the wallet. The caller owns the guarded update that
 * zeroes `order.walletApplied`, so this is only ever reached once per order —
 * see refundOrderRedemptions in orderRedemption.ts, which unwinds wallet credit
 * and reward points together in a single atomic update.
 */
export async function creditWalletRefund(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { walletBalance: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "refunded", amount }));
}

/**
 * Credit the referrer REFERRAL_REWARD when their referee's first order is paid. Idempotent:
 * flips the referee's `referralCredited` flag first and only pays if that flip
 * matched, so a retried verify never double-pays.
 */
export async function creditReferral(
  db: Db,
  refereeUserId: ObjectId,
): Promise<void> {
  const referee = await db
    .collection(USERS)
    .findOne(
      { _id: refereeUserId },
      { projection: { referredBy: 1, referralCredited: 1 } },
    );
  if (!referee?.referredBy || referee.referralCredited) return;

  const claimed = await db
    .collection(USERS)
    .updateOne(
      { _id: refereeUserId, referralCredited: { $ne: true } },
      { $set: { referralCredited: true, updatedAt: new Date() } },
    );
  if (claimed.matchedCount === 0) return; // someone else already credited

  const referrerId = new ObjectId(String(referee.referredBy));
  // Never credit a self-referral.
  if (referrerId.equals(refereeUserId)) return;
  await db
    .collection(USERS)
    .updateOne(
      { _id: referrerId },
      {
        $inc: { walletBalance: REFERRAL_REWARD },
        $set: { updatedAt: new Date() },
      },
    );
  await db.collection<WalletTransaction>(LEDGER).insertOne(
    ledgerEntry({
      userId: referrerId,
      refereeUserId,
      type: "referral_earned",
      amount: REFERRAL_REWARD,
    }),
  );
}
