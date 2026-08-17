/**
 * Reward-point and streak math — pure and client-safe (no DB import), so the
 * cart can preview exactly what the server later awards. The DB-touching
 * operations live in rewardPoints.ts (server only), and the per-location earn
 * percentages in streakLadder.ts.
 *
 * Following the ist.ts convention, nothing here reads the clock: callers inject
 * `today` as an IST calendar date (yyyy-mm-dd).
 */

import { istDaysBetween, istMonth } from "./ist";
import { orderAmounts, type OrderAmountFields } from "./orderAmounts";
import { MIN_PAYABLE } from "./walletMath";

/** A customer's stored streak: order days banked this month, and the last one. */
export interface StreakState {
  count: number;
  /** IST calendar date (yyyy-mm-dd) of the last streak-advancing paid order. */
  lastDate: string;
}

/**
 * The streak value an order placed on `today` produces.
 *
 * The count is order DAYS banked within the current calendar month, not
 * consecutive days: gaps inside the month are free, so a customer who orders on
 * the 2nd and again on the 20th is on rung 2 either way. What ends a cycle is
 * the calendar turning over — everyone starts again at rung 1 on the 1st.
 *
 * That makes the cycle derivable from `lastDate` alone: if its month differs
 * from today's, the previous cycle is over. No separate cycle-start field to
 * keep in sync.
 *
 * - no usable previous streak → 1
 * - already ordered today     → unchanged (a 2nd order can't advance it)
 * - last order was last month → 1 (new cycle)
 * - otherwise                 → +1, however long the gap
 *
 * The count keeps climbing past the ladder's length; `rateForStreak` is what
 * holds the rate at the 20% cap for the rest of the month.
 */
export function nextStreak(prev: StreakState | null, today: string): number {
  if (!prev || !prev.lastDate || !(prev.count > 0)) return 1;

  const gap = istDaysBetween(prev.lastDate, today);
  // Same day, or a lastDate somehow ahead of today (clock skew): hold, never punish.
  if (gap <= 0) return prev.count;

  // A new calendar month starts the ladder over.
  if (istMonth(prev.lastDate) !== istMonth(today)) return 1;

  return prev.count + 1;
}

/**
 * The amount an order earns points on: what the customer is actually charged.
 *
 * That is the gross bill — items, less every discount, plus GST and the delivery
 * charge — minus any wallet credit and reward points spent against it. So the
 * percentage always applies to the figure the customer sees as payable, and
 * paying with a balance lowers what the order earns.
 *
 * Delegates to `orderAmounts` so "what was charged" has one definition across
 * the award path, the admin table and the reports. Reads the order's own stored
 * amounts, which means it is only meaningful once redemption has been applied —
 * at payment time, not at creation.
 */
export function rewardBaseFor(order: OrderAmountFields): number {
  return orderAmounts(order).paid;
}

/**
 * Points earned on a charged amount at a given rate, rounded to a whole point.
 * Pair it with `rewardBaseFor` to get the base.
 */
export function computePointsEarned(rewardBase: number, rate: number): number {
  if (!(rewardBase > 0) || !(rate > 0)) return 0;
  return Math.round((rewardBase * rate) / 100);
}

/**
 * How many points to spend on an order, given the payable that REMAINS after
 * wallet credit has already been applied. Capped so at least MIN_PAYABLE is
 * still charged — Razorpay cannot charge ₹0, and wallet + points share that
 * single floor. Never negative, never more than the balance.
 */
export function computePointsApplied(
  balance: number,
  payableAfterWallet: number,
): { pointsApplied: number; amountPayable: number } {
  const spendable = Math.max(0, Math.floor(payableAfterWallet) - MIN_PAYABLE);
  const pointsApplied = Math.max(
    0,
    Math.min(Math.floor(Math.max(0, balance)), spendable),
  );
  return { pointsApplied, amountPayable: payableAfterWallet - pointsApplied };
}

/**
 * Normalise the admin-entered holiday list: well-formed yyyy-mm-dd only,
 * de-duplicated and sorted. Anything unparseable is dropped rather than
 * rejected, so one bad row can never wedge the settings document.
 */
export function sanitizeExemptDates(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const dates = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) dates.add(trimmed);
  }
  return [...dates].sort();
}
