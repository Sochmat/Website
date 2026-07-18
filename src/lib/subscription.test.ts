import { describe, it, expect } from "vitest";
import { isSubscriptionHost, generatePlanNumber } from "./subscription";

describe("isSubscriptionHost", () => {
  it("matches the subscription subdomain, ignoring port and case", () => {
    expect(isSubscriptionHost("subscription.sochmat.com")).toBe(true);
    expect(isSubscriptionHost("Subscription.sochmat.com:443")).toBe(true);
    expect(isSubscriptionHost("localhost:3000")).toBe(false);
    expect(isSubscriptionHost("sochmat.com")).toBe(false);
    expect(isSubscriptionHost(null)).toBe(false);
    expect(isSubscriptionHost(undefined)).toBe(false);
  });
});

describe("generatePlanNumber", () => {
  it("produces a SUBP-prefixed code", () => {
    expect(generatePlanNumber()).toMatch(/^SUBP-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});
