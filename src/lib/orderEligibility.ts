import { Db, ObjectId } from "mongodb";
import { hasPhone } from "./phone";

const ORDERS = "orders";
const USERS = "users";
/** A burst of unpaid discounted orders older than this no longer blocks a new
 *  discount, so an abandoned first attempt never permanently denies it. */
const PENDING_DISCOUNT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Whether this user's next order should receive the 20% first-order discount.
 * True only when they have no paid order yet AND no still-fresh pending order
 * already holding the discount — so creating many unpaid orders at once cannot
 * each claim it. Mirrors the subscription first-plan eligibility rule.
 *
 * An account with no phone number is never eligible. Uniqueness only rations
 * the offer among accounts that *have* a phone; without this, the legacy
 * phoneless accounts would keep collecting it once per email address, which is
 * the loophole the unique-phone rule exists to close. It costs nothing
 * permanent — the next checkout backfills their number and the offer returns.
 */
export async function isEligibleForFirstOrderDiscount(
  db: Db,
  userId: ObjectId,
): Promise<boolean> {
  const user = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { phone: 1 } });
  if (!hasPhone(user)) return false;

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
