import { GST_RATE } from "./subscription";
import type { BracketPlanTotals } from "./subscriptionBrackets";

/** Discount on a customer's first paid subscription plan. */
export const FIRST_PLAN_DISCOUNT_RATE = 0.2;
/** Razorpay cannot charge ₹0, so wallet always leaves at least this much payable. */
export const MIN_PAYABLE = 1;
/** ₹ credited to a referrer when their referee's first plan is paid. */
export const REFERRAL_REWARD = 200;

/**
 * 20% off the pre-GST subtotal, with GST recomputed on the discounted subtotal.
 * `firstPlanDiscount` is the ₹ removed from the grand total.
 */
export function applyFirstPlanDiscount(totals: BracketPlanTotals): {
  discountedSubtotal: number;
  tax: number;
  totalAmount: number;
  firstPlanDiscount: number;
} {
  const discountedSubtotal = Math.round(
    totals.subtotal * (1 - FIRST_PLAN_DISCOUNT_RATE),
  );
  const tax = Math.round(discountedSubtotal * GST_RATE);
  const totalAmount = discountedSubtotal + tax;
  return {
    discountedSubtotal,
    tax,
    totalAmount,
    firstPlanDiscount: totals.totalAmount - totalAmount,
  };
}

/**
 * How much wallet balance to apply to a plan, capped so at least MIN_PAYABLE
 * remains for Razorpay to charge.
 */
export function computeWalletApplied(
  balance: number,
  totalAmount: number,
): { walletApplied: number; amountPayable: number } {
  const spendable = Math.max(0, totalAmount - MIN_PAYABLE);
  const walletApplied = Math.max(0, Math.min(Math.floor(balance), spendable));
  return { walletApplied, amountPayable: totalAmount - walletApplied };
}
