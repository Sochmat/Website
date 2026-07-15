import { describe, expect, it } from "vitest";
import { renderKot } from "@/lib/print/renderKot";
import { renderBill } from "@/lib/print/renderBill";
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

describe("renderKot", () => {
  it("produces a document with the KOT number and items", () => {
    const html = renderKot(SAMPLE_TICKET, CFG);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("KOT - 1");
    expect(html).toContain("Veg Beetroot Burger");
    expect(html).toContain("+ Extra Cheese");
    expect(html).toContain("Rs. 449");
  });

  it("escapes HTML in product names", () => {
    const html = renderKot(
      { ...SAMPLE_TICKET, items: [{ name: "A & <b>", quantity: 1, price: 10, addOns: [] }] },
      CFG,
    );
    expect(html).toContain("A &amp; &lt;b&gt;");
  });
});

describe("renderBill", () => {
  it("produces a document with totals and paid state", () => {
    const html = renderBill(SAMPLE_BILL, CFG);
    expect(html).toContain("PAID");
    expect(html).toContain("Grand Total");
    expect(html).toContain("Rs. 315.00");
    expect(html).toContain("Sub Total");
    expect(html).toContain("Paid via Upi");
  });
});
