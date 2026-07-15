import { describe, expect, it } from "vitest";
import {
  computeBillTotals,
  formatIstDateTime,
  splitItemPricing,
  titleCase,
} from "@/lib/print/receiptModel";
import { SAMPLE_BILL } from "@/lib/print/samples";

describe("splitItemPricing", () => {
  it("splits the add-on price off the line base price", () => {
    const p = splitItemPricing(SAMPLE_BILL.items[0]); // burger 180, +cheese 20x1
    expect(p.basePrice).toBe(160);
    expect(p.baseAmount).toBe(160);
    expect(p.addOns).toEqual([
      { name: "Extra Cheese", unitPrice: 20, quantity: 1, amount: 20 },
    ]);
  });

  it("scales add-on quantity by the dish quantity", () => {
    const p = splitItemPricing(SAMPLE_BILL.items[1]); // rice 150, +raita 15x2
    expect(p.basePrice).toBe(120);
    expect(p.variantName).toBe("Large");
    expect(p.addOns[0]).toEqual({
      name: "Extra Raita",
      unitPrice: 15,
      quantity: 2,
      amount: 30,
    });
  });
});

describe("computeBillTotals", () => {
  it("computes the bill totals for the sample", () => {
    const t = computeBillTotals(SAMPLE_BILL);
    expect(t.subTotal).toBe(330);
    expect(t.discount).toBe(31);
    expect(t.deliveryFee).toBe(0);
    expect(t.cgst).toBe(8);
    expect(t.sgst).toBe(8);
    expect(t.roundOff).toBe(0);
    expect(t.grandTotal).toBe(315);
    expect(t.totalQty).toBe(2);
  });
});

describe("formatIstDateTime", () => {
  it("formats an ISO instant in Asia/Kolkata", () => {
    const { date, time, full } = formatIstDateTime("2026-07-15T09:30:00Z");
    expect(date).toBe("15/07/26");
    expect(time).toBe("15:00");
    expect(full).toBe("15/07/26 15:00");
  });
});

describe("titleCase", () => {
  it("title-cases a payment method", () => {
    expect(titleCase("upi")).toBe("Upi");
    expect(titleCase("")).toBe("");
  });
});
