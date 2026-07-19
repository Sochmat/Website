import { describe, expect, it } from "vitest";
import {
  BILL_COLS,
  KOT_COLS,
  billLines,
  kotLines,
} from "@/lib/print/receiptLines";
import { SAMPLE_BILL, SAMPLE_TICKET } from "@/lib/print/samples";
import type { ShopConfig } from "@/lib/print/types";

const CFG: ShopConfig = {
  shopName: "SOCHMAT",
  orderSource: "Website",
  legalName: "Sochmat Foods",
  gstNo: "GST123",
  fssaiNo: "FSSAI123",
  contact: "9999999999",
  address: "MG Road",
  cashier: "biller",
};

const textOf = (lines: { text: string }[]) => lines.map((l) => l.text);

describe("kotLines", () => {
  it("includes the KOT number, items, add-ons, and total", () => {
    const lines = kotLines(SAMPLE_TICKET, CFG);
    const texts = textOf(lines);
    expect(texts).toContain("KOT - 1");
    expect(texts.some((t) => t.includes("Veg Beetroot Burger"))).toBe(true);
    expect(texts.some((t) => t.includes("+ Extra Cheese"))).toBe(true);
    expect(texts.some((t) => t.includes("Rs. 449"))).toBe(true);
  });

  it("keeps every non-rule line within the KOT column width", () => {
    for (const l of kotLines(SAMPLE_TICKET, CFG)) {
      if (!l.rule) expect(l.text.length).toBeLessThanOrEqual(KOT_COLS);
    }
  });
});

describe("billLines", () => {
  it("includes the paid state, totals, and payment line", () => {
    const texts = textOf(billLines(SAMPLE_BILL, CFG));
    expect(texts).toContain("PAID");
    expect(texts.some((t) => t.startsWith("Grand Total"))).toBe(true);
    expect(texts.some((t) => t.includes("Rs. 315.00"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Sub Total"))).toBe(true);
    expect(texts).toContain("Paid via Upi");
  });

  it("keeps every non-rule line within the bill column width", () => {
    for (const l of billLines(SAMPLE_BILL, CFG)) {
      if (!l.rule) expect(l.text.length).toBeLessThanOrEqual(BILL_COLS);
    }
  });
});
