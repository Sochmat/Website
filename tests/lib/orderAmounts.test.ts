import { describe, it, expect } from "vitest";
import { orderAmounts } from "@/lib/orderAmounts";

describe("orderAmounts", () => {
  it("splits a points-redeemed order into bill vs charged", () => {
    // SO-MSEUJ2V5-0SA6: ₹299 pre-tax + ₹15 GST, ₹114 paid in points.
    expect(
      orderAmounts({
        totalAmount: 314,
        netAmount: 200,
        amountPayable: 200,
        pointsApplied: 114,
      }),
    ).toEqual({
      total: 314,
      paid: 200,
      walletApplied: 0,
      pointsApplied: 114,
      hasRedemption: true,
    });
  });

  it("reports wallet credit the same way", () => {
    expect(
      orderAmounts({ totalAmount: 60, netAmount: 49, walletApplied: 11 }),
    ).toMatchObject({ total: 60, paid: 49, walletApplied: 11, hasRedemption: true });
  });

  it("counts both balances when an order used each", () => {
    expect(
      orderAmounts({
        totalAmount: 500,
        netAmount: 380,
        walletApplied: 50,
        pointsApplied: 70,
      }),
    ).toMatchObject({ paid: 380, walletApplied: 50, pointsApplied: 70 });
  });

  it("treats an order without redemption as fully charged", () => {
    expect(orderAmounts({ totalAmount: 250, netAmount: 250 })).toEqual({
      total: 250,
      paid: 250,
      walletApplied: 0,
      pointsApplied: 0,
      hasRedemption: false,
    });
  });

  it("falls back to the bill for legacy orders that predate netAmount", () => {
    expect(orderAmounts({ totalAmount: 180 })).toMatchObject({
      total: 180,
      paid: 180,
      hasRedemption: false,
    });
  });

  it("uses amountPayable when netAmount is missing", () => {
    expect(
      orderAmounts({ totalAmount: 314, amountPayable: 200, pointsApplied: 114 }),
    ).toMatchObject({ paid: 200 });
  });

  it("derives the charge from the balances when neither field was stored", () => {
    expect(
      orderAmounts({ totalAmount: 314, pointsApplied: 114 }),
    ).toMatchObject({ paid: 200, hasRedemption: true });
  });

  it("never reports a negative charge", () => {
    expect(
      orderAmounts({ totalAmount: 100, pointsApplied: 500 }),
    ).toMatchObject({ paid: 0 });
  });

  it("ignores junk values rather than rendering NaN", () => {
    expect(
      orderAmounts({
        totalAmount: "314" as unknown,
        netAmount: null,
        walletApplied: undefined,
        pointsApplied: "abc" as unknown,
      }),
    ).toEqual({
      total: 314,
      paid: 314,
      walletApplied: 0,
      pointsApplied: 0,
      hasRedemption: false,
    });
  });
});
