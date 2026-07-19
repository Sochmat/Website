import { Db, ObjectId } from "mongodb";
import { REFERRAL_REWARD } from "./subscriptionDiscount";
import type { WalletTransaction } from "./types";

const USERS = "users";
const PLANS = "subscriptionMealPlans";
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
 * Atomically hold `amount` from the user's balance for a plan. Guarded on
 * sufficient balance so it can't go negative or double-spend across concurrent
 * checkouts. Returns false (and reserves nothing) if the balance moved underneath.
 */
export async function reserveWallet(
  db: Db,
  userId: ObjectId,
  planId: ObjectId,
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
    .insertOne(ledgerEntry({ userId, planId, type: "reserved", amount }));
  return true;
}

/** Reserved → spent. The balance was already decremented at reserve time. */
export async function settleWallet(
  db: Db,
  userId: ObjectId,
  planId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, planId, type: "spent", amount }));
}

/**
 * Return a pending plan's reservation to the wallet. Idempotent: the plan's
 * `walletApplied` is zeroed in the same guarded update, so a second call is a
 * no-op. Returns the ₹ refunded.
 */
export async function refundReservationForPlan(
  db: Db,
  planId: ObjectId,
  userId: ObjectId,
): Promise<number> {
  const before = await db.collection(PLANS).findOneAndUpdate(
    {
      _id: planId,
      userId,
      paymentStatus: "pending",
      walletApplied: { $gt: 0 },
    },
    [
      {
        $set: {
          walletApplied: 0,
          amountPayable: "$totalAmount",
          updatedAt: new Date(),
        },
      },
    ],
    { returnDocument: "before" },
  );
  const amount = Number(before?.walletApplied ?? 0);
  if (amount <= 0) return 0;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { walletBalance: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, planId, type: "refunded", amount }));
  return amount;
}

/** Safety net for checkouts abandoned before the client fail-call fired. */
export async function sweepStalePlanReservations(
  db: Db,
  userId: ObjectId,
  olderThanMs: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .collection(PLANS)
    .find(
      {
        userId,
        paymentStatus: "pending",
        walletApplied: { $gt: 0 },
        createdAt: { $lt: cutoff },
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const p of stale) {
    await refundReservationForPlan(db, p._id as ObjectId, userId);
  }
}

/**
 * Credit the referrer ₹200 when their referee's first plan is paid. Idempotent:
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
