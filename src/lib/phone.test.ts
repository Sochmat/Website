import { describe, it, expect } from "vitest";
import { normalizePhone, hasPhone } from "./phone";

describe("normalizePhone", () => {
  it("passes a bare 10-digit mobile through", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("6000000000")).toBe("6000000000");
  });

  it("strips the punctuation people actually type", () => {
    expect(normalizePhone(" 98765 43210 ")).toBe("9876543210");
    expect(normalizePhone("98765-43210")).toBe("9876543210");
    expect(normalizePhone("(98765) 43210")).toBe("9876543210");
  });

  it("peels a +91 country code", () => {
    expect(normalizePhone("+919876543210")).toBe("9876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("919876543210")).toBe("9876543210");
  });

  it("peels a trunk 0", () => {
    expect(normalizePhone("09876543210")).toBe("9876543210");
  });

  it("collapses every spelling of one number to the same string", () => {
    const spellings = [
      "9876543210",
      "+91 9876543210",
      "091-98765-43210",
      "  (+91) 98765 43210  ",
    ];
    const normalized = new Set(spellings.map(normalizePhone));
    expect(normalized).toEqual(new Set(["9876543210"]));
  });

  it("rejects numbers that are the wrong length", () => {
    expect(normalizePhone("98765432")).toBeNull();
    expect(normalizePhone("98765432101")).toBeNull();
    expect(normalizePhone("9198765432101")).toBeNull();
  });

  it("rejects mobile numbers that do not start 6-9", () => {
    expect(normalizePhone("1234567890")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(normalizePhone("0000000000")).toBeNull();
  });

  it("rejects empty and non-numeric input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("accepts a number given as a number", () => {
    expect(normalizePhone(9876543210)).toBe("9876543210");
  });
});

describe("hasPhone", () => {
  it("is true only for a non-empty string phone", () => {
    expect(hasPhone({ phone: "9876543210" })).toBe(true);
  });

  it("is false for the legacy empty-string and missing forms", () => {
    expect(hasPhone({ phone: "" })).toBe(false);
    expect(hasPhone({ phone: "   " })).toBe(false);
    expect(hasPhone({})).toBe(false);
    expect(hasPhone(null)).toBe(false);
    expect(hasPhone(undefined)).toBe(false);
  });
});
