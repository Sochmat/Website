import { describe, it, expect } from "vitest";
import { randomReferralCode } from "./referral";

describe("randomReferralCode", () => {
  it("is SM + 4 unambiguous uppercase chars", () => {
    const code = randomReferralCode(() => 0);
    expect(code).toMatch(/^SM[A-Z0-9]{4}$/);
    expect(code).toHaveLength(6);
  });
  it("never emits ambiguous chars (0/O/1/I)", () => {
    for (let i = 0; i < 32; i++) {
      const code = randomReferralCode(() => i / 32);
      expect(code.slice(2)).not.toMatch(/[01OI]/);
    }
  });
});
