import { describe, it, expect } from "vitest";
import { SOCIETIES } from "./societies";
import {
  DEFAULT_RULE,
  DEFAULT_THRESHOLD,
  MAX_FEE,
  MAX_THRESHOLD,
  amountToFreeDelivery,
  computeDeliveryFee,
  ruleFor,
  sanitizeDeliveryFeeConfig,
  sanitizeRule,
} from "./deliveryFees";

const SOCIETY_ID = SOCIETIES[0].id;
const RULE = { threshold: 250, fee: 30 };

describe("the default rule", () => {
  it("charges nothing until an admin sets a fee", () => {
    expect(DEFAULT_RULE).toEqual({ threshold: DEFAULT_THRESHOLD, fee: 0 });
    expect(computeDeliveryFee(0, DEFAULT_RULE)).toBe(0);
  });
});

describe("computeDeliveryFee", () => {
  it("charges below the threshold", () => {
    expect(computeDeliveryFee(249, RULE)).toBe(30);
    expect(computeDeliveryFee(0, RULE)).toBe(30);
  });

  it("is free at and above the threshold", () => {
    expect(computeDeliveryFee(250, RULE)).toBe(0);
    expect(computeDeliveryFee(251, RULE)).toBe(0);
    expect(computeDeliveryFee(10_000, RULE)).toBe(0);
  });

  it("charges nothing when the fee is zero, however small the order", () => {
    expect(computeDeliveryFee(10, { threshold: 250, fee: 0 })).toBe(0);
  });

  it("treats a zero threshold as always free", () => {
    expect(computeDeliveryFee(0, { threshold: 0, fee: 30 })).toBe(0);
  });
});

describe("amountToFreeDelivery", () => {
  it("reports the shortfall while a fee applies", () => {
    expect(amountToFreeDelivery(200, RULE)).toBe(50);
    expect(amountToFreeDelivery(249, RULE)).toBe(1);
  });

  it("is zero once delivery is already free", () => {
    expect(amountToFreeDelivery(250, RULE)).toBe(0);
    expect(amountToFreeDelivery(300, RULE)).toBe(0);
  });

  it("is zero when no fee is configured, so no pointless nudge shows", () => {
    expect(amountToFreeDelivery(10, { threshold: 250, fee: 0 })).toBe(0);
  });

  it("rounds a fractional shortfall up", () => {
    expect(amountToFreeDelivery(249.4, RULE)).toBe(1);
  });
});

describe("sanitizeRule", () => {
  it("rounds and clamps both halves", () => {
    expect(sanitizeRule({ threshold: 249.6, fee: 29.4 })).toEqual({
      threshold: 250,
      fee: 29,
    });
    expect(sanitizeRule({ threshold: 1e9, fee: 1e9 })).toEqual({
      threshold: MAX_THRESHOLD,
      fee: MAX_FEE,
    });
  });

  it("accepts numeric strings from form inputs", () => {
    expect(sanitizeRule({ threshold: "250", fee: "30" })).toEqual(RULE);
  });

  it("accepts zeros", () => {
    expect(sanitizeRule({ threshold: 0, fee: 0 })).toEqual({
      threshold: 0,
      fee: 0,
    });
  });

  it("rejects a rule with a missing or unusable half", () => {
    expect(sanitizeRule({ threshold: 250 })).toBeNull();
    expect(sanitizeRule({ threshold: 250, fee: null })).toBeNull();
    expect(sanitizeRule({ threshold: 250, fee: "" })).toBeNull();
    expect(sanitizeRule({ threshold: -5, fee: 30 })).toBeNull();
    expect(sanitizeRule({ threshold: "abc", fee: 30 })).toBeNull();
    expect(sanitizeRule(null)).toBeNull();
  });
});

describe("sanitizeDeliveryFeeConfig", () => {
  it("keeps known locations and falls back for a missing default", () => {
    expect(
      sanitizeDeliveryFeeConfig({
        byLocation: { [SOCIETY_ID]: RULE, bogus: RULE },
      }),
    ).toEqual({ default: DEFAULT_RULE, byLocation: { [SOCIETY_ID]: RULE } });
  });

  it("drops a location whose rule is unusable, so it inherits the default", () => {
    expect(
      sanitizeDeliveryFeeConfig({ byLocation: { [SOCIETY_ID]: { fee: 30 } } }),
    ).toEqual({ default: DEFAULT_RULE, byLocation: {} });
  });

  it("yields the default config for junk", () => {
    expect(sanitizeDeliveryFeeConfig(null)).toEqual({
      default: DEFAULT_RULE,
      byLocation: {},
    });
  });
});

describe("ruleFor", () => {
  it("prefers the location's own rule", () => {
    const config = {
      default: { threshold: 250, fee: 30 },
      byLocation: { [SOCIETY_ID]: { threshold: 400, fee: 50 } },
    };
    expect(ruleFor(config, SOCIETY_ID)).toEqual({ threshold: 400, fee: 50 });
  });

  it("falls back to the default, then to the built-in", () => {
    const config = { default: { threshold: 300, fee: 20 }, byLocation: {} };
    expect(ruleFor(config, SOCIETY_ID)).toEqual({ threshold: 300, fee: 20 });
    expect(ruleFor(null, SOCIETY_ID)).toEqual(DEFAULT_RULE);
    expect(ruleFor(undefined, undefined)).toEqual(DEFAULT_RULE);
  });
});
