import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifies a correct password", async () => {
    const h = await hashPassword("s3cret!");
    expect(await verifyPassword("s3cret!", h)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const h = await hashPassword("s3cret!");
    expect(await verifyPassword("nope", h)).toBe(false);
  });
  it("produces distinct hashes for the same input (random salt)", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
  it("returns false on a malformed stored value", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
