import { Db, ObjectId } from "mongodb";

const ORDERS = "orders";
/** A burst of unpaid discounted orders older than this no longer blocks a new
 *  discount, so an abandoned first attempt never permanently denies it. */
const PENDING_DISCOUNT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Whether this user's next order should receive the 20% first-order discount.
 * True only when they have no paid order yet AND no still-fresh pending order
 * already holding the discount — so creating many unpaid orders at once cannot
 * each claim it. Mirrors the subscription first-plan eligibility rule.
 */
export async function isEligibleForFirstOrderDiscount(
  db: Db,
  userId: ObjectId,
): Promise<boolean> {
  const priorPaid = await db
    .collection(ORDERS)
    .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });
  if (priorPaid) return false;

  const freshDiscountedPending = await db.collection(ORDERS).findOne(
    {
      userId,
      paymentStatus: "pending",
      firstOrderDiscount: { $gt: 0 },
      createdAt: { $gt: new Date(Date.now() - PENDING_DISCOUNT_WINDOW_MS) },
    },
    { projection: { _id: 1 } },
  );
  return !freshDiscountedPending;
}
