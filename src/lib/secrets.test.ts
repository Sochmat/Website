import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

beforeAll(() => {
  process.env.KITCHENOS_SECRET_KEY = randomBytes(32).toString("base64");
});

describe("secrets", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("./secrets");
    const blob = encryptSecret("rzp_secret_123");
    expect(blob).not.toContain("rzp_secret_123");
    expect(decryptSecret(blob)).toBe("rzp_secret_123");
  });
  it("throws on tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("./secrets");
    const blob = encryptSecret("abc").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(() => decryptSecret(blob)).toThrow();
  });
});
