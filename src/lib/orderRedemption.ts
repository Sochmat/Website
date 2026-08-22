import { Db, ObjectId } from "mongodb";
import { creditWalletRefund, reserveWallet } from "./wallet";
import {
  creditRewardPointsRefund,
  reserveRewardPoints,
} from "./rewardPoints";

const ORDERS = "orders";

/** What a released checkout gave back, and what a late payment must retake. */
export interface ReleasedRedemption {
  wallet: number;
  points: number;
}

/**
 * Return an unpaid order's redemptions — wallet credit AND reward points — to
 * the customer's balances.
 *
 * The two are zeroed in ONE guarded update alongside the restored
 * `netAmount`/`amountPayable`, which is what makes this idempotent: a second
 * call finds nothing to unwind and does nothing. Splitting it per balance
 * would open a window where a retry refunds one of them twice.
 *
 * What was given back is stamped on the order as `redemptionReleased`. The
 * Razorpay order was raised for the REDUCED amount, so a payment that captures
 * after this ran still settles at that figure (see `expectedChargePaise`) — and
 * `reapplyOrderRedemptions` uses the stamp to retake what the customer has
 * effectively spent. Without the stamp a late payment would hand them the
 * discount and the balance both.
 */
export async function refundOrderRedemptions(
  db: Db,
  orderId: ObjectId,
): Promise<{ wallet: number; points: number }> {
  const before = await db.collection(ORDERS).findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: { $ne: "paid" },
      $or: [{ walletApplied: { $gt: 0 } }, { pointsApplied: { $gt: 0 } }],
    },
    [
      {
        $set: {
          redemptionReleased: {
            wallet: { $ifNull: ["$walletApplied", 0] },
            points: { $ifNull: ["$pointsApplied", 0] },
            at: "$$NOW",
          },
          walletApplied: 0,
          pointsApplied: 0,
          amountPayable: "$totalAmount",
          netAmount: "$totalAmount",
          updatedAt: "$$NOW",
        },
      },
    ],
    { returnDocument: "before" },
  );

  const wallet = Number(before?.walletApplied ?? 0);
  const points = Number(before?.pointsApplied ?? 0);
  const userId = before?.userId as ObjectId | undefined;
  if (!userId) return { wallet: 0, points: 0 };

  if (wallet > 0) await creditWalletRefund(db, userId, orderId, wallet);
  if (points > 0) await creditRewardPointsRefund(db, userId, orderId, points);
  return { wallet, points };
}

/**
 * Retake a released redemption because the payment landed after all.
 *
 * The mirror of `refundOrderRedemptions`, and it discharges the same contract:
 * the `redemptionReleased` stamp is cleared in the SAME guarded update that
 * reads it, so two callers (verify racing the webhook) can never both retake.
 *
 * Each balance is retaken through the ordinary guarded reserve, so it can't go
 * negative. A customer who already spent the returned points leaves a shortfall
 * — reported, never forced: they keep the balance and the order stands at its
 * full bill, which is a small gap the caller logs for admin rather than a
 * silently negative balance.
 */
export async function reapplyOrderRedemptions(
  db: Db,
  orderId: ObjectId,
): Promise<{
  wallet: number;
  points: number;
  shortfall: ReleasedRedemption | null;
}> {
  const before = await db
    .collection(ORDERS)
    .findOneAndUpdate(
      { _id: orderId, redemptionReleased: { $exists: true } },
      { $unset: { redemptionReleased: "" }, $set: { updatedAt: new Date() } },
      { returnDocument: "before" },
    );

  const released = (before?.redemptionReleased ?? null) as {
    wallet?: unknown;
    points?: unknown;
  } | null;
  const userId = before?.userId as ObjectId | undefined;
  if (!released || !userId) return { wallet: 0, points: 0, shortfall: null };

  const wantWallet = Math.max(0, Number(released.wallet ?? 0));
  const wantPoints = Math.max(0, Number(released.points ?? 0));

  const gotWallet = (await reserveWallet(db, userId, orderId, wantWallet))
    ? wantWallet
    : 0;
  const gotPoints = (await reserveRewardPoints(
    db,
    userId,
    orderId,
    wantPoints,
  ))
    ? wantPoints
    : 0;

  // Only what was actually retaken goes back onto the order — netAmount and
  // amountPayable must keep describing the bill this customer really owes.
  const total = Number(before?.totalAmount ?? 0);
  const payable = Math.max(0, total - gotWallet - gotPoints);
  const shortWallet = wantWallet - gotWallet;
  const shortPoints = wantPoints - gotPoints;
  const shortfall =
    shortWallet > 0 || shortPoints > 0
      ? { wallet: shortWallet, points: shortPoints }
      : null;

  await db.collection(ORDERS).updateOne(
    { _id: orderId },
    {
      $set: {
        walletApplied: gotWallet,
        pointsApplied: gotPoints,
        amountPayable: payable,
        netAmount: payable,
        ...(shortfall ? { redemptionShortfall: shortfall } : {}),
        updatedAt: new Date(),
      },
    },
  );

  return { wallet: gotWallet, points: gotPoints, shortfall };
}

/** Safety net for checkouts abandoned before the client fail-call fired. */
export async function sweepStaleOrderRedemptions(
  db: Db,
  userId: ObjectId,
  olderThanMs: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .collection(ORDERS)
    .find(
      {
        userId,
        paymentStatus: { $ne: "paid" },
        createdAt: { $lt: cutoff },
        $or: [{ walletApplied: { $gt: 0 } }, { pointsApplied: { $gt: 0 } }],
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const order of stale) {
    await refundOrderRedemptions(db, order._id as ObjectId);
  }
}

/**
 * The same sweep, for every customer at once — the cron's job. A customer who
 * never comes back still gets their balance returned, which the per-user sweep
 * (it only runs at the top of their NEXT order) can never reach.
 */
export async function sweepAllStaleOrderRedemptions(
  db: Db,
  olderThanMs: number,
  limit = 500,
): Promise<{ scanned: number; wallet: number; points: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .collection(ORDERS)
    .find(
      {
        paymentStatus: { $ne: "paid" },
        createdAt: { $lt: cutoff },
        $or: [{ walletApplied: { $gt: 0 } }, { pointsApplied: { $gt: 0 } }],
      },
      { projection: { _id: 1 }, limit },
    )
    .toArray();

  let wallet = 0;
  let points = 0;
  for (const order of stale) {
    const returned = await refundOrderRedemptions(db, order._id as ObjectId);
    wallet += returned.wallet;
    points += returned.points;
  }
  return { scanned: stale.length, wallet, points };
}
