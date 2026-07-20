import { describe, it, expect } from "vitest";
import { randomReferralCode, referralPrefix } from "./referral";

describe("referralPrefix", () => {
  it("uses the uppercased first name, letters only", () => {
    expect(referralPrefix("Harsh Sharma")).toBe("HARSH");
    expect(referralPrefix("  jane ")).toBe("JANE");
    expect(referralPrefix("O'Brien Smith")).toBe("OBRIEN");
  });
  it("falls back to USER when there's no usable name", () => {
    expect(referralPrefix("")).toBe("USER");
    expect(referralPrefix(undefined)).toBe("USER");
    expect(referralPrefix("123 456")).toBe("USER");
  });
  it("caps a very long first name at 12 letters", () => {
    expect(referralPrefix("Bartholomewlongname")).toBe("BARTHOLOMEWL");
  });
});

describe("randomReferralCode", () => {
  it("is the name prefix followed by 4 digits", () => {
    const code = randomReferralCode("Harsh", () => 0);
    expect(code).toBe("HARSH0000");
    expect(code).toMatch(/^HARSH\d{4}$/);
  });
  it("zero-pads the numeric suffix to 4 digits", () => {
    expect(randomReferralCode("Jane", () => 0.0042)).toBe("JANE0042");
  });
  it("uses the USER fallback for an empty name", () => {
    expect(randomReferralCode("", () => 0.9999)).toBe("USER9999");
  });
});
