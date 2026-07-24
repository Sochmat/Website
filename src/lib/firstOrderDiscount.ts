/**
 * First-order discount for the à-la-carte flow: a flat 20% off the item
 * subtotal (pre-GST) on a customer's first paid order. It does NOT stack with
 * coupons — the order takes whichever is larger (see the order flow) — but the
 * per-location discount still applies on top.
 *
 * Pure math only; eligibility (which needs the DB) lives in orderEligibility.ts.
 */

/** Discount rate on a customer's first order. */
export const FIRST_ORDER_DISCOUNT_RATE = 0.2;

/** The rupee first-order discount for an item subtotal (rounded). 0 if empty. */
export function computeFirstOrderDiscount(subtotal: number): number {
  if (!(subtotal > 0)) return 0;
  return Math.round(subtotal * FIRST_ORDER_DISCOUNT_RATE);
}

/**
 * Resolve the "best value" offer discount between a coupon and the first-order
 * discount — the two never stack, the larger wins. Returns the amount to apply
 * and which one it was, so the caller can suppress the other.
 */
export function resolveOfferDiscount(
  couponDiscount: number,
  firstOrderDiscount: number,
): { offerDiscount: number; firstOrderApplied: boolean } {
  const coupon = Math.max(0, couponDiscount);
  const firstOrder = Math.max(0, firstOrderDiscount);
  // Tie goes to the first-order discount (no coupon consumed).
  const firstOrderApplied = firstOrder > 0 && firstOrder >= coupon;
  return {
    offerDiscount: firstOrderApplied ? firstOrder : coupon,
    firstOrderApplied,
  };
}
