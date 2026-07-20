import { Db, ObjectId } from "mongodb";

const PLANS = "subscriptionMealPlans";
/** A burst of unpaid discounted plans older than this no longer blocks a new
 *  discount, so an abandoned first attempt never permanently denies it. Matches
 *  the wallet reservation sweep window. */
const PENDING_DISCOUNT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Whether this user's next plan should receive the 20% first-plan discount. True
 * only when they have no paid plan yet AND no still-fresh pending plan already
 * holding the discount — so creating many unpaid plans at once cannot each claim it.
 */
export async function isEligibleForFirstPlanDiscount(
  db: Db,
  userId: ObjectId,
): Promise<boolean> {
  const priorPaid = await db
    .collection(PLANS)
    .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });
  if (priorPaid) return false;

  const freshDiscountedPending = await db.collection(PLANS).findOne(
    {
      userId,
      paymentStatus: "pending",
      firstPlanDiscount: { $gt: 0 },
      createdAt: { $gt: new Date(Date.now() - PENDING_DISCOUNT_WINDOW_MS) },
    },
    { projection: { _id: 1 } },
  );
  return !freshDiscountedPending;
}
