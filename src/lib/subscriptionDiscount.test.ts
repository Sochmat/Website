import { describe, it, expect } from "vitest";
import {
  FIRST_PLAN_DISCOUNT_RATE,
  MIN_PAYABLE,
  REFERRAL_REWARD,
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "./subscriptionDiscount";
import type { BracketPlanTotals } from "./subscriptionBrackets";

const totals = (subtotal: number): BracketPlanTotals => ({
  pricePerMeal: subtotal / 7,
  mealCount: 7,
  subtotal,
  tax: Math.round(subtotal * 0.05),
  totalAmount: subtotal + Math.round(subtotal * 0.05),
});

describe("constants", () => {
  it("are the agreed values", () => {
    expect(FIRST_PLAN_DISCOUNT_RATE).toBe(0.2);
    expect(MIN_PAYABLE).toBe(1);
    expect(REFERRAL_REWARD).toBe(200);
  });
});

describe("applyFirstPlanDiscount", () => {
  it("takes 20% off the subtotal and recomputes GST", () => {
    // subtotal 700 -> discounted 560, tax 28, total 588; original total 735
    const r = applyFirstPlanDiscount(totals(700));
    expect(r.discountedSubtotal).toBe(560);
    expect(r.tax).toBe(28);
    expect(r.totalAmount).toBe(588);
    expect(r.firstPlanDiscount).toBe(147);
  });
});

describe("computeWalletApplied", () => {
  it("applies the whole balance when it fits", () => {
    expect(computeWalletApplied(200, 588)).toEqual({
      walletApplied: 200,
      amountPayable: 388,
    });
  });
  it("caps so at least MIN_PAYABLE remains chargeable", () => {
    expect(computeWalletApplied(1000, 588)).toEqual({
      walletApplied: 587,
      amountPayable: 1,
    });
  });
  it("applies nothing for a zero/empty balance", () => {
    expect(computeWalletApplied(0, 588)).toEqual({
      walletApplied: 0,
      amountPayable: 588,
    });
  });
});
