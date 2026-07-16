import { ObjectId, type Db } from "mongodb";
import { accountCredits, expireCredits, type CreditAccounting } from "./subscriptionSchedule";
import type { SubscriptionMealPlan } from "./types";

export const PLANS = "subscriptionMealPlans";

export interface OwnedPlan {
  plan: SubscriptionMealPlan;
  accounting: CreditAccounting;
}

/**
 * Load a plan the caller actually owns, sweeping lapsed credits on the way.
 *
 * Returns null for "not found" AND for "someone else's plan" — the caller answers
 * 404 either way, so a plan id can't be probed for existence.
 *
 * Expiry is applied lazily here rather than by a cron, which means every read and
 * every write path sees the same truth: a credit past `expiresOn` is never spendable.
 */
export async function loadOwnedPlan(
  db: Db,
  planId: string,
  userId: ObjectId,
  now: Date,
): Promise<OwnedPlan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const plan = (await db
    .collection(PLANS)
    .findOne({ _id: new ObjectId(planId), userId })) as unknown as SubscriptionMealPlan | null;
  if (!plan) return null;

  const expired = expireCredits(plan.credits, plan.expiresOn, now);
  if (expired) {
    plan.credits = expired;
    const swept = accountCredits(expired, plan.expiresOn, now);
    if (swept.exhausted && plan.status === "active") {
      plan.status = "expired";
    }
    await db
      .collection(PLANS)
      .updateOne(
        { _id: new ObjectId(planId) },
        { $set: { credits: expired, status: plan.status, updatedAt: now } },
      );
  }

  return { plan, accounting: accountCredits(plan.credits, plan.expiresOn, now) };
}

/** Dates this plan has already committed. One meal per date, per plan. */
export function takenDates(plan: SubscriptionMealPlan): string[] {
  return plan.credits
    .filter((c) => (c.status === "scheduled" || c.status === "delivered") && c.date)
    .map((c) => c.date!);
}

/** What the customer has eaten / booked, for the suggestion rotation. */
export function planHistory(plan: SubscriptionMealPlan): Array<{ date: string; productId: string }> {
  return plan.credits
    .filter((c) => c.date && c.productId)
    .map((c) => ({ date: c.date!, productId: c.productId! }));
}

/** Mark the plan completed once no credit is available or awaiting delivery. */
export async function settlePlanStatus(db: Db, planId: string, now: Date): Promise<void> {
  const plan = (await db
    .collection(PLANS)
    .findOne({ _id: new ObjectId(planId) })) as unknown as SubscriptionMealPlan | null;
  if (!plan || plan.status !== "active") return;

  if (accountCredits(plan.credits, plan.expiresOn, now).exhausted) {
    await db
      .collection(PLANS)
      .updateOne({ _id: new ObjectId(planId) }, { $set: { status: "completed", updatedAt: now } });
  }
}
