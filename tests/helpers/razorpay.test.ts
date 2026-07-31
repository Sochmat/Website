import { describe, expect, it } from "vitest";
import { normalizeContact } from "@/helpers/razorpay";

describe("normalizeContact", () => {
  it("assumes India for a plain 10-digit number", () => {
    expect(normalizeContact("9876543210")).toBe("+919876543210");
  });

  it("strips spaces, dashes and brackets", () => {
    expect(normalizeContact("+91 98765-43210")).toBe("+919876543210");
    expect(normalizeContact("(987) 654 3210")).toBe("+919876543210");
  });

  it("drops a leading trunk zero", () => {
    expect(normalizeContact("09876543210")).toBe("+919876543210");
  });

  it("keeps an existing country code", () => {
    expect(normalizeContact("919876543210")).toBe("+919876543210");
    expect(normalizeContact("+1 415 555 2671")).toBe("+14155552671");
  });

  it("returns empty for missing or unusable input", () => {
    expect(normalizeContact("")).toBe("");
    expect(normalizeContact(null)).toBe("");
    expect(normalizeContact(undefined)).toBe("");
    expect(normalizeContact("12345")).toBe("");
    expect(normalizeContact("not a phone")).toBe("");
  });
});
