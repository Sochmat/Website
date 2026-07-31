/**
 * Storefront view of a coupon — the shape /api/coupons returns — plus the
 * labelling and discount maths shared by the checkout coupon field and the
 * "View all coupons" sheet, so both describe an offer identically.
 *
 * The amounts here are previews: the order route recomputes every discount
 * server-side before it is honoured.
 */

export type FreeItem = { id: string; name: string; price: number };

export type StoreCoupon = {
  code: string;
  discountType: "flat" | "percent" | "freeItem";
  discountAmount: number;
  discountPercent: number;
  maxDiscount: number;
  minAmount?: number;
  freeItem?: FreeItem | null;
};

function percentDiscount(total: number, pct: number, max: number): number {
  const raw = Math.round((total * pct) / 100);
  return max > 0 ? Math.min(raw, max) : raw;
}

/** Extra flat/percent discount a free-item coupon may also carry. */
function freeItemExtra(coupon: StoreCoupon): string {
  if (coupon.discountPercent > 0)
    return ` + ${coupon.discountPercent}% off${
      coupon.maxDiscount > 0 ? ` upto ₹${coupon.maxDiscount}` : ""
    }`;
  if (coupon.discountAmount > 0) return ` + ₹${coupon.discountAmount} off`;
  return "";
}

/** One-line summary of what a coupon gives, e.g. "10% off upto ₹50". */
export function couponLabel(coupon: StoreCoupon): string {
  if (coupon.discountType === "percent")
    return `${coupon.discountPercent}% off${
      coupon.maxDiscount > 0 ? ` upto ₹${coupon.maxDiscount}` : ""
    }`;
  if (coupon.discountType === "freeItem")
    return `Free ${coupon.freeItem?.name ?? "item"}${freeItemExtra(coupon)}`;
  return `₹${coupon.discountAmount} off`;
}

/** Money off the item subtotal. Free-item coupons may add a flat/percent cut. */
export function computeCouponDiscount(
  coupon: StoreCoupon,
  totalPrice: number,
): number {
  if (coupon.discountType === "percent")
    return percentDiscount(
      totalPrice,
      coupon.discountPercent,
      coupon.maxDiscount,
    );
  if (coupon.discountType === "freeItem") {
    if (coupon.discountPercent > 0)
      return percentDiscount(
        totalPrice,
        coupon.discountPercent,
        coupon.maxDiscount,
      );
    return coupon.discountAmount || 0;
  }
  return coupon.discountAmount;
}
