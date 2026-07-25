/**
 * Reward-point and streak math — pure and client-safe (no DB import), so the
 * cart can preview exactly what the server later awards. The DB-touching
 * operations live in rewardPoints.ts (server only).
 *
 * Following the ist.ts convention, nothing here reads the clock: callers inject
 * `today` as an IST calendar date (yyyy-mm-dd).
 */

import { addIstDays, istDaysBetween, istWeekday } from "./ist";
import { MIN_PAYABLE } from "./walletMath";

/** Earn rate (%) by streak day: day 1 → 10%, day 6 and beyond → the cap. */
export const POINT_RATES = [10, 12, 14, 16, 18, 20];

/** The ceiling on the earn rate, however long the streak runs. */
export const MAX_POINT_RATE = POINT_RATES[POINT_RATES.length - 1];

/** A customer's stored streak: how many consecutive days, and the last one. */
export interface StreakState {
  count: number;
  /** IST calendar date (yyyy-mm-dd) of the last streak-advancing paid order. */
  lastDate: string;
}

/** The earn rate for a given streak day. Clamped to the ladder at both ends. */
export function rateForStreak(streak: number): number {
  if (!(streak > 0)) return POINT_RATES[0];
  const index = Math.min(Math.floor(streak), POINT_RATES.length) - 1;
  return POINT_RATES[index];
}

/**
 * Days that never break a streak: weekends, plus any date an admin has marked
 * as a holiday (kitchen closed, festival). Skipping one is not a missed day.
 */
export function isExemptDay(date: string, exemptDates: Set<string>): boolean {
  const weekday = istWeekday(date);
  return weekday === "Saturday" || weekday === "Sunday" || exemptDates.has(date);
}

/**
 * The streak value an order placed on `today` produces.
 *
 * - no usable previous streak → 1 (a fresh start)
 * - already ordered today     → unchanged (a 2nd order can't advance it)
 * - every intervening day exempt → +1
 * - a working day was missed  → 1
 */
export function nextStreak(
  prev: StreakState | null,
  today: string,
  exemptDates: Set<string>,
): number {
  if (!prev || !prev.lastDate || !(prev.count > 0)) return 1;

  const gap = istDaysBetween(prev.lastDate, today);
  // Same day, or a lastDate somehow ahead of today (clock skew): hold, never punish.
  if (gap <= 0) return prev.count;

  for (let offset = 1; offset < gap; offset++) {
    if (!isExemptDay(addIstDays(prev.lastDate, offset), exemptDates)) return 1;
  }
  return prev.count + 1;
}

/** Points earned for a pre-tax base at a given rate, rounded to a whole point. */
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
