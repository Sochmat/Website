import { describe, it, expect } from "vitest";
import { MIN_PAYABLE, REFERRAL_REWARD, computeWalletApplied } from "./walletMath";

describe("constants", () => {
  it("keep parity with the subscription flow", () => {
    expect(MIN_PAYABLE).toBe(1);
    expect(REFERRAL_REWARD).toBe(75);
  });
});

describe("computeWalletApplied", () => {
  it("applies the full balance when it fits under the total minus ₹1", () => {
    expect(computeWalletApplied(100, 500)).toEqual({
      walletApplied: 100,
      amountPayable: 400,
    });
  });

  it("caps at total minus MIN_PAYABLE so ₹1 is always payable", () => {
    expect(computeWalletApplied(1000, 500)).toEqual({
      walletApplied: 499,
      amountPayable: 1,
    });
  });

  it("applies nothing when the total is at the minimum", () => {
    expect(computeWalletApplied(1000, 1)).toEqual({
      walletApplied: 0,
      amountPayable: 1,
    });
  });

  it("floors a fractional balance and never goes negative", () => {
    expect(computeWalletApplied(50.9, 500)).toEqual({
      walletApplied: 50,
      amountPayable: 450,
    });
    expect(computeWalletApplied(-20, 500)).toEqual({
      walletApplied: 0,
      amountPayable: 500,
    });
  });

  it("applies nothing when the balance is zero", () => {
    expect(computeWalletApplied(0, 500)).toEqual({
      walletApplied: 0,
      amountPayable: 500,
    });
  });
});
