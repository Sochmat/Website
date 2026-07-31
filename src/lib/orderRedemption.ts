import { Db, ObjectId } from "mongodb";
import { creditWalletRefund } from "./wallet";
import { creditRewardPointsRefund } from "./rewardPoints";

const ORDERS = "orders";

/**
 * Return an unpaid order's redemptions — wallet credit AND reward points — to
 * the customer's balances.
 *
 * The two are zeroed in ONE guarded update alongside the restored
 * `netAmount`/`amountPayable`, which is what makes this idempotent: a second
 * call finds nothing to unwind and does nothing. Splitting it per balance
 * would open a window where a retry refunds one of them twice.
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
          walletApplied: 0,
          pointsApplied: 0,
          amountPayable: "$totalAmount",
          netAmount: "$totalAmount",
          updatedAt: new Date(),
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
