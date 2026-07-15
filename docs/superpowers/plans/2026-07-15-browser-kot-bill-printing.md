# Browser-based KOT / Bill Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print KOTs and customer bills directly from the admin orders page (running in the shop PC's browser) and retire the separate Python print agent.

**Architecture:** The admin orders page, when marked as the "Print Station" (a per-browser toggle), renders KOTs/bills as HTML sized for 80 mm thermal paper from the order data it already polls, prints each through a hidden iframe via `window.print()`, then acks the server (admin-cookie authenticated) so nothing reprints. Ticket math is ported from the Python agent into pure, unit-tested TypeScript.

**Tech Stack:** Next.js (App Router), TypeScript, React client component, Ant Design, MongoDB driver, Vitest.

## Global Constraints

- Path alias: `@/` → `src/` (see `tsconfig.json` / `vitest.config.ts`).
- Tests: Vitest, files named `*.test.ts` under `src/**`, node environment. Run with `npx vitest run <path>`.
- `/api/admin/*` is already gated behind the admin session cookie by `src/middleware.ts` — new admin endpoints need no extra auth code.
- UI: prefer Ant Design components (`Button`, `message`, etc.) — the orders page already uses them.
- Money formatting on the bill uses 2 decimals (`toFixed(2)`); KOT total prints the raw integer rupee value, matching the current Python output.
- Timestamps are formatted in `Asia/Kolkata` as `dd/mm/yy HH:MM`.
- Do not change KOT/bill numbering or the accept/reject/refund flow — only rendering, printing, and ack authentication change.

---

### Task 1: Shared print types, shop config, and config endpoint

**Files:**
- Create: `src/lib/print/types.ts`
- Create: `src/lib/shopConfig.ts`
- Create: `src/app/api/admin/print-config/route.ts`
- Test: `src/lib/shopConfig.test.ts`

**Interfaces:**
- Produces: `ShopConfig`, `ReceiptAddOn`, `ReceiptItem`, `ReceiptOrder` (types); `getShopConfig(): ShopConfig`; `GET /api/admin/print-config` → `{ success: true, config: ShopConfig }`.

- [ ] **Step 1: Create the shared types**

`src/lib/print/types.ts`:

```ts
/** Shop identity fields printed on the KOT/bill, sourced from server env. */
export interface ShopConfig {
  shopName: string;
  orderSource: string;
  legalName: string;
  gstNo: string;
  fssaiNo: string;
  contact: string;
  address: string;
  cashier: string;
}

export interface ReceiptAddOn {
  name: string;
  price: number;
  quantity: number;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  /** Line unit price INCLUDING its add-ons (matches stored order item price). */
  price: number;
  variantName?: string;
  addOns: ReceiptAddOn[];
}

/** Normalized order shape consumed by the KOT/bill renderers. */
export interface ReceiptOrder {
  id: string;
  orderNumber: string;
  kotNumber: number | null;
  billNumber: number | null;
  /** ISO timestamp, or null to use "now". */
  createdAt: string | null;
  method: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  discountAmount: number;
  deliveryFee: number;
  tax: number;
  receiver: { name: string; phone: string; address: string };
  items: ReceiptItem[];
}
```

- [ ] **Step 2: Create the shop config reader**

`src/lib/shopConfig.ts`:

```ts
import type { ShopConfig } from "@/lib/print/types";

/**
 * Shop identity fields for the printed KOT/bill, read from server env vars.
 * Mirrors the values the old Python print agent read from its .env.
 */
export function getShopConfig(): ShopConfig {
  return {
    shopName: process.env.SHOP_NAME || "SOCHMAT",
    orderSource: process.env.ORDER_SOURCE || "Website",
    legalName: process.env.SHOP_LEGAL_NAME || "",
    gstNo: process.env.GST_NO || "",
    fssaiNo: process.env.FSSAI_NO || "",
    contact: process.env.SHOP_CONTACT || "",
    address: process.env.SHOP_ADDRESS || "",
    cashier: process.env.CASHIER || "biller",
  };
}
```

- [ ] **Step 3: Write the failing test**

`src/lib/shopConfig.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getShopConfig } from "@/lib/shopConfig";

describe("getShopConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("falls back to defaults when env is unset", () => {
    delete process.env.SHOP_NAME;
    delete process.env.CASHIER;
    const cfg = getShopConfig();
    expect(cfg.shopName).toBe("SOCHMAT");
    expect(cfg.orderSource).toBe("Website");
    expect(cfg.cashier).toBe("biller");
    expect(cfg.legalName).toBe("");
  });

  it("reads values from env", () => {
    process.env.SHOP_NAME = "Sochmat Kitchen";
    process.env.GST_NO = "29ABCDE1234F1Z5";
    const cfg = getShopConfig();
    expect(cfg.shopName).toBe("Sochmat Kitchen");
    expect(cfg.gstNo).toBe("29ABCDE1234F1Z5");
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `npx vitest run src/lib/shopConfig.test.ts`
Expected: PASS (config already implemented in Step 2; if the import path is wrong it FAILs first).

- [ ] **Step 5: Create the config endpoint**

`src/app/api/admin/print-config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getShopConfig } from "@/lib/shopConfig";

/**
 * Shop config for the browser print station. Admin-session gated by middleware.
 *  GET /api/admin/print-config -> { success, config }
 */
export async function GET() {
  return NextResponse.json({ success: true, config: getShopConfig() });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/print/types.ts src/lib/shopConfig.ts src/lib/shopConfig.test.ts src/app/api/admin/print-config/route.ts
git commit -m "feat: shop config types + admin print-config endpoint"
```

---

### Task 2: Receipt calculation model (ported from Python)

**Files:**
- Create: `src/lib/print/receiptModel.ts`
- Test: `src/lib/print/receiptModel.test.ts`
- Create: `src/lib/print/samples.ts`

**Interfaces:**
- Consumes: `ReceiptOrder`, `ReceiptItem` from `@/lib/print/types`.
- Produces: `splitItemPricing(item: ReceiptItem): PricedItem`; `computeBillTotals(order: ReceiptOrder): BillTotals`; `formatIstDateTime(iso: string | null): { date: string; time: string; full: string }`; `titleCase(s: string): string`; `SAMPLE_TICKET`, `SAMPLE_BILL` (`ReceiptOrder`).
- `PricedItem` = `{ name; quantity; variantName?; basePrice; baseAmount; addOns: PricedAddOn[] }`; `PricedAddOn` = `{ name; unitPrice; quantity; amount }`; `BillTotals` = `{ subTotal; discount; deliveryFee; cgst; sgst; roundOff; grandTotal; totalQty }`.

- [ ] **Step 1: Create the sample fixtures**

`src/lib/print/samples.ts`:

```ts
import type { ReceiptOrder } from "@/lib/print/types";

/** Sample KOT/bill data for the Test-print button and unit tests. */
export const SAMPLE_TICKET: ReceiptOrder = {
  id: "sample",
  orderNumber: "SO-TEST-0001",
  kotNumber: 1,
  billNumber: 2770,
  createdAt: "2026-07-15T09:30:00Z",
  method: "Delivery",
  paymentMethod: "upi",
  paymentStatus: "paid",
  totalAmount: 449,
  discountAmount: 0,
  deliveryFee: 0,
  tax: 0,
  receiver: {
    name: "Test Customer",
    phone: "9876543210",
    address: "12 MG Road, Indiranagar, Bengaluru 560038",
  },
  items: [
    {
      name: "Veg Beetroot Burger",
      quantity: 1,
      price: 199,
      addOns: [{ name: "Extra Cheese", price: 20, quantity: 1 }],
    },
    { name: "Diet Coke (300ml)", quantity: 1, price: 50, addOns: [] },
    {
      name: "Chole Masala Rice Bowl",
      quantity: 1,
      price: 200,
      variantName: "Large",
      addOns: [{ name: "Extra Raita", price: 15, quantity: 2 }],
    },
  ],
};

export const SAMPLE_BILL: ReceiptOrder = {
  id: "sample",
  orderNumber: "SO-TEST-0001",
  kotNumber: 1,
  billNumber: 2770,
  createdAt: "2026-07-15T09:30:00Z",
  method: "Delivery",
  paymentMethod: "upi",
  paymentStatus: "paid",
  totalAmount: 315,
  discountAmount: 31,
  deliveryFee: 0,
  tax: 16,
  receiver: {
    name: "Test Customer",
    phone: "9876543210",
    address: "12 MG Road, Indiranagar, Bengaluru 560038",
  },
  items: [
    {
      name: "Veg Beetroot Burger",
      quantity: 1,
      price: 180,
      addOns: [{ name: "Extra Cheese", price: 20, quantity: 1 }],
    },
    {
      name: "Chole Masala Rice Bowl",
      quantity: 1,
      price: 150,
      variantName: "Large",
      addOns: [{ name: "Extra Raita", price: 15, quantity: 2 }],
    },
  ],
};
```

- [ ] **Step 2: Write the failing test**

`src/lib/print/receiptModel.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/print/receiptModel.test.ts`
Expected: FAIL — cannot resolve `@/lib/print/receiptModel`.

- [ ] **Step 4: Implement the model**

`src/lib/print/receiptModel.ts`:

```ts
import type { ReceiptItem, ReceiptOrder } from "@/lib/print/types";

export interface PricedAddOn {
  name: string;
  unitPrice: number;
  /** Add-on quantity scaled by the dish quantity. */
  quantity: number;
  amount: number;
}

export interface PricedItem {
  name: string;
  quantity: number;
  variantName?: string;
  /** Line unit price with add-ons removed. */
  basePrice: number;
  baseAmount: number;
  addOns: PricedAddOn[];
}

export interface BillTotals {
  subTotal: number;
  discount: number;
  deliveryFee: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
  totalQty: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split a line item into its base dish price and per-add-on priced rows.
 * The stored item price bundles the add-ons; subtract them back out so the
 * dish row shows its base price and each add-on prints as its own row.
 */
export function splitItemPricing(item: ReceiptItem): PricedItem {
  const qty = Math.trunc(item.quantity || 0);
  const addOns = item.addOns ?? [];
  const addOnUnitSum = addOns.reduce(
    (s, a) => s + (a.price || 0) * (a.quantity || 0),
    0,
  );
  const basePrice = (item.price || 0) - addOnUnitSum;
  return {
    name: item.name,
    quantity: qty,
    variantName: item.variantName,
    basePrice,
    baseAmount: basePrice * qty,
    addOns: addOns.map((a) => {
      const scaledQty = Math.trunc(a.quantity || 0) * qty;
      return {
        name: a.name,
        unitPrice: a.price || 0,
        quantity: scaledQty,
        amount: (a.price || 0) * scaledQty,
      };
    }),
  };
}

/** Bill totals: sub-total from line prices, GST split in half, round-off. */
export function computeBillTotals(order: ReceiptOrder): BillTotals {
  const subTotal = order.items.reduce(
    (s, it) => s + (it.price || 0) * Math.trunc(it.quantity || 0),
    0,
  );
  const discount = order.discountAmount || 0;
  const deliveryFee = order.deliveryFee || 0;
  const tax = order.tax || 0;
  const cgst = round2(tax / 2);
  const sgst = round2(tax - cgst);
  const grandTotal = order.totalAmount || 0;
  const roundOff = round2(
    grandTotal - (subTotal - discount + deliveryFee + cgst + sgst),
  );
  const totalQty = order.items.reduce(
    (s, it) => s + Math.trunc(it.quantity || 0),
    0,
  );
  return {
    subTotal,
    discount,
    deliveryFee,
    cgst,
    sgst,
    roundOff,
    grandTotal,
    totalQty,
  };
}

/** Format an ISO instant as shop-local (Asia/Kolkata) dd/mm/yy HH:MM. */
export function formatIstDateTime(iso: string | null): {
  date: string;
  time: string;
  full: string;
} {
  const d = iso ? new Date(iso) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00"; // en-GB renders midnight as 24
  const date = `${get("day")}/${get("month")}/${get("year")}`;
  const time = `${hour}:${get("minute")}`;
  return { date, time, full: `${date} ${time}` };
}

/** Capitalise each word (e.g. "upi" -> "Upi"). */
export function titleCase(s: string): string {
  return s
    ? s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    : s;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/print/receiptModel.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/print/receiptModel.ts src/lib/print/receiptModel.test.ts src/lib/print/samples.ts
git commit -m "feat: receipt calculation model + samples (ported from print agent)"
```

---

### Task 3: KOT and bill HTML renderers

**Files:**
- Create: `src/lib/print/receiptDocument.ts`
- Create: `src/lib/print/renderKot.ts`
- Create: `src/lib/print/renderBill.ts`
- Test: `src/lib/print/render.test.ts`

**Interfaces:**
- Consumes: `ReceiptOrder`, `ShopConfig`, `splitItemPricing`, `computeBillTotals`, `formatIstDateTime`, `titleCase`, `SAMPLE_TICKET`, `SAMPLE_BILL`.
- Produces: `renderKot(order: ReceiptOrder, cfg: ShopConfig): string`; `renderBill(order: ReceiptOrder, cfg: ShopConfig): string` — each returns a complete `<!doctype html>` document string ready to write into a print iframe.

- [ ] **Step 1: Create the document wrapper + line helpers**

`src/lib/print/receiptDocument.ts`:

```ts
/** Escape user/product text before embedding it in receipt HTML. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Left-aligned line. */
export function left(text: string, bold = false): string {
  return `<div class="ln${bold ? " b" : ""}">${escapeHtml(text)}</div>`;
}

/** Centered line. */
export function center(text: string, bold = false): string {
  return `<div class="ln c${bold ? " b" : ""}">${escapeHtml(text)}</div>`;
}

/** Emphasised (large, bold, centered) line — shop name, KOT number. */
export function emph(text: string): string {
  return `<div class="ln c b xl">${escapeHtml(text)}</div>`;
}

/** Two-column line: label left, value right. */
export function row(label: string, value: string, bold = false): string {
  return `<div class="ln rowln${bold ? " b" : ""}"><span>${escapeHtml(
    label,
  )}</span><span>${escapeHtml(value)}</span></div>`;
}

/** Horizontal divider. */
export function hr(): string {
  return `<div class="hr"></div>`;
}

const RECEIPT_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 80mm; font-family: "Courier New", monospace; color: #000;
         background: #fff; font-size: 12px; line-height: 1.25; padding: 4px 6px; }
  .ln { white-space: pre-wrap; word-break: break-word; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .xl { font-size: 18px; line-height: 1.2; }
  .rowln { display: flex; justify-content: space-between; gap: 8px; }
  .rowln > span:last-child { text-align: right; white-space: nowrap; }
  .hr { border-top: 1px dashed #000; margin: 2px 0; }
`;

/** Wrap the receipt body lines in a full printable HTML document. */
export function receiptDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}
```

- [ ] **Step 2: Create the KOT renderer**

`src/lib/print/renderKot.ts`:

```ts
import type { ReceiptOrder, ShopConfig } from "@/lib/print/types";
import { formatIstDateTime } from "@/lib/print/receiptModel";
import {
  center,
  emph,
  hr,
  left,
  receiptDocument,
  row,
} from "@/lib/print/receiptDocument";

/** Render a kitchen order ticket (KOT) as a printable HTML document. */
export function renderKot(order: ReceiptOrder, cfg: ShopConfig): string {
  const { full } = formatIstDateTime(order.createdAt);
  const lines: string[] = [];

  lines.push(center(`From: ${cfg.orderSource}`, true));
  lines.push(emph(cfg.shopName));
  lines.push(center(full));
  lines.push(emph(order.kotNumber != null ? `KOT - ${order.kotNumber}` : "KOT"));
  lines.push(center(`Order ID: ${order.orderNumber}`));
  lines.push(center(`Method: ${order.method}`, true));
  lines.push(hr());
  lines.push(row("Item", "Qty"));
  lines.push(hr());

  for (const item of order.items) {
    const qty = Math.trunc(item.quantity || 0);
    lines.push(row(item.name, String(qty), true));
    if (item.variantName) lines.push(left(`  (${item.variantName})`));
    for (const addOn of item.addOns ?? []) {
      const addQty = Math.trunc(addOn.quantity || 0) * qty;
      lines.push(row(`+ ${addOn.name}`, String(addQty), true));
    }
  }

  lines.push(hr());
  const pay = order.paymentMethod
    ? `Payment : ${order.paymentMethod} (${order.paymentStatus})`
    : `Payment : ${order.paymentStatus}`;
  lines.push(left(pay));
  lines.push(
    left(`Customer: ${order.receiver.name} ${order.receiver.phone}`.trim()),
  );
  lines.push(hr());
  lines.push(left(`Total   : Rs. ${order.totalAmount}`, true));

  if (cfg.fssaiNo || cfg.gstNo) {
    lines.push(hr());
    if (cfg.fssaiNo) lines.push(center(`FSSAI No: ${cfg.fssaiNo}`));
    if (cfg.gstNo) lines.push(center(`GST No: ${cfg.gstNo}`));
  }

  return receiptDocument(lines.join("\n"));
}
```

- [ ] **Step 3: Create the bill renderer**

`src/lib/print/renderBill.ts`:

```ts
import type { ReceiptOrder, ShopConfig } from "@/lib/print/types";
import {
  computeBillTotals,
  formatIstDateTime,
  splitItemPricing,
  titleCase,
} from "@/lib/print/receiptModel";
import {
  center,
  hr,
  left,
  receiptDocument,
  row,
} from "@/lib/print/receiptDocument";

/** Render a customer bill as a printable HTML document. */
export function renderBill(order: ReceiptOrder, cfg: ShopConfig): string {
  const totals = computeBillTotals(order);
  const paid = (order.paymentStatus || "").toLowerCase() === "paid";
  const { date, time } = formatIstDateTime(order.createdAt);
  const lines: string[] = [];

  lines.push(center(paid ? "PAID" : "UNPAID", true));
  if (cfg.legalName) lines.push(center(cfg.legalName, true));
  if (cfg.gstNo) lines.push(center(`GST No:-${cfg.gstNo}`));
  if (cfg.fssaiNo) lines.push(center(`FSSAI:-${cfg.fssaiNo}`));

  lines.push(hr());
  lines.push(left(`From ${cfg.orderSource}[${order.orderNumber}]`));
  lines.push(left(`Name: ${order.receiver.name}`));
  if (order.receiver.phone) lines.push(left(`Phone: ${order.receiver.phone}`));
  if (order.receiver.address)
    lines.push(left(`Address: ${order.receiver.address}`));

  lines.push(hr());
  lines.push(row(`Date: ${date}`, order.method, true));
  lines.push(left(time));
  lines.push(
    row(`Cashier: ${cfg.cashier}`, `Bill No.: ${order.billNumber ?? "-"}`),
  );

  lines.push(hr());
  lines.push(row("Item", "Qty x Price   Amount"));
  lines.push(hr());

  for (const item of order.items) {
    const p = splitItemPricing(item);
    lines.push(left(p.name, true));
    if (p.variantName) lines.push(left(`  (${p.variantName})`));
    lines.push(
      row(`  ${p.quantity} x ${p.basePrice.toFixed(2)}`, p.baseAmount.toFixed(2)),
    );
    for (const addOn of p.addOns) {
      lines.push(left(`+ ${addOn.name}`, true));
      lines.push(
        row(
          `  ${addOn.quantity} x ${addOn.unitPrice.toFixed(2)}`,
          addOn.amount.toFixed(2),
        ),
      );
    }
  }

  lines.push(hr());
  lines.push(row("Sub Total", totals.subTotal.toFixed(2)));
  if (totals.discount) lines.push(row("Discount", `(${totals.discount.toFixed(2)})`));
  if (totals.deliveryFee)
    lines.push(row("Delivery Charge", totals.deliveryFee.toFixed(2)));
  if (totals.cgst) lines.push(row("CGST @2.5%", totals.cgst.toFixed(2)));
  if (totals.sgst) lines.push(row("SGST @2.5%", totals.sgst.toFixed(2)));
  if (Math.abs(totals.roundOff) >= 0.01) {
    const sign = totals.roundOff >= 0 ? "+" : "";
    lines.push(row("Round off", `${sign}${totals.roundOff.toFixed(2)}`));
  }

  lines.push(hr());
  lines.push(row("Grand Total", `Rs. ${totals.grandTotal.toFixed(2)}`, true));
  lines.push(left(`Total Qty: ${totals.totalQty}`));
  lines.push(
    left(
      paid
        ? `Paid via ${titleCase(order.paymentMethod)}`
        : `Payment: ${order.paymentStatus}`,
    ),
  );

  if (cfg.contact || cfg.address) {
    lines.push(hr());
    if (cfg.contact) lines.push(center(`Contact:- ${cfg.contact}`));
    if (cfg.address) lines.push(center(cfg.address));
  }
  lines.push(center("Thanks for Ordering....!!"));

  return receiptDocument(lines.join("\n"));
}
```

- [ ] **Step 4: Write the smoke test**

`src/lib/print/render.test.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/print/render.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/print/receiptDocument.ts src/lib/print/renderKot.ts src/lib/print/renderBill.ts src/lib/print/render.test.ts
git commit -m "feat: KOT and bill HTML renderers for 80mm printing"
```

---

### Task 4: Print-station iframe queue helper

**Files:**
- Create: `src/lib/print/printStation.ts`

**Interfaces:**
- Produces: `enqueuePrint(html: string, onPrinted: () => Promise<void> | void): void` — serializes printing; renders `html` in a hidden iframe, calls `print()`, then runs `onPrinted` once. Prints one job at a time.

- [ ] **Step 1: Implement the queue + iframe printer**

`src/lib/print/printStation.ts`:

```ts
/**
 * Serialized browser printing for the shop's print station.
 *
 * Each job writes a full receipt HTML document into a hidden same-origin
 * iframe, calls the iframe window's print(), then runs its onPrinted callback
 * (used to ack the server). Jobs run strictly one at a time so print dialogs /
 * spooled jobs never overlap or interleave.
 */

type Job = { html: string; onPrinted: () => Promise<void> | void };

const queue: Job[] = [];
let running = false;

export function enqueuePrint(
  html: string,
  onPrinted: () => Promise<void> | void,
): void {
  queue.push({ html, onPrinted });
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        await printHtml(job.html);
      } finally {
        // Ack even if the print promise resolved via the fallback timer; a
        // failed ack is the caller's concern (it re-enqueues next poll).
        await job.onPrinted();
      }
    }
  } finally {
    running = false;
  }
}

function printHtml(html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // Delay removal so the print job is fully spooled first.
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };

    win.onafterprint = finish;
    doc.open();
    doc.write(html);
    doc.close();

    // Give the iframe a tick to lay out before printing. The fallback timer
    // covers browsers (e.g. Chrome --kiosk-printing) that never fire
    // onafterprint.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        // ignore; the fallback timer resolves the job
      }
      setTimeout(finish, 1500);
    }, 100);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/print/printStation.ts
git commit -m "feat: serialized iframe print queue for the print station"
```

---

### Task 5: Server ack flags on the orders endpoint

**Files:**
- Modify: `src/app/api/admin/orders/route.ts`

**Interfaces:**
- Produces: `PATCH /api/admin/orders` now accepts `{ id, markKotPrinted?: true }` → sets `kotPrinted`, `kotPrintedAt`; and `{ id, markBillPrinted?: true }` → sets `billPrinted`, `billPrintedAt`, clears `billRequested`. Returns `{ success: true }`.

- [ ] **Step 1: Destructure the new flags**

In `src/app/api/admin/orders/route.ts`, change the PATCH body destructure (currently line 93):

```ts
const { id, status, paymentStatus, printBill, reject } = await req.json();
```

to:

```ts
const { id, status, paymentStatus, printBill, reject, markKotPrinted, markBillPrinted } =
  await req.json();
```

- [ ] **Step 2: Add the ack branch**

Immediately after the id-validation block (the `if (!id || !ObjectId.isValid(id))` check, ~line 99) and before the `status` validation, insert:

```ts
    // Browser print station acks: mark a KOT or bill as printed. Mirrors the
    // retired POST /api/print/* endpoints, but authenticated by the admin
    // session cookie (enforced in middleware).
    if (markKotPrinted || markBillPrinted) {
      const { db } = await connectToDatabase();
      const _id = new ObjectId(id);
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (markKotPrinted) {
        set.kotPrinted = true;
        set.kotPrintedAt = new Date();
      }
      if (markBillPrinted) {
        set.billPrinted = true;
        set.billRequested = false;
        set.billPrintedAt = new Date();
      }
      const result = await db.collection("orders").updateOne({ _id }, { $set: set });
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { success: false, message: "Order not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`), log into the admin panel, and in the browser devtools console run:

```js
fetch("/api/admin/orders", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: "<a real confirmed order _id>", markKotPrinted: true }),
}).then((r) => r.json()).then(console.log);
```

Expected: `{ success: true }`, and the order's `kotPrinted` is `true` in the DB.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/orders/route.ts
git commit -m "feat: markKotPrinted/markBillPrinted acks on admin orders endpoint"
```

---

### Task 6: Wire the print station into the admin orders page

**Files:**
- Modify: `src/app/admin/orders/page.tsx`

**Interfaces:**
- Consumes: `enqueuePrint`, `renderKot`, `renderBill`, `ShopConfig`, `SAMPLE_TICKET`, `SAMPLE_BILL`, `ReceiptOrder`.

This task extends `OrderRow` to carry the fields the receipts need, adds the Print Station toggle + auto-print loop + Test-print button, and makes Accept / Print Bill update local state so printing fires immediately.

- [ ] **Step 1: Add imports**

At the top of `src/app/admin/orders/page.tsx`, below the existing imports, add:

```ts
import { enqueuePrint } from "@/lib/print/printStation";
import { renderKot } from "@/lib/print/renderKot";
import { renderBill } from "@/lib/print/renderBill";
import { SAMPLE_BILL, SAMPLE_TICKET } from "@/lib/print/samples";
import type { ReceiptOrder, ShopConfig } from "@/lib/print/types";
```

And add a module-level constant near the other `*_KEY` constants (~line 12):

```ts
const PRINT_STATION_KEY = "sochmat.printStation";
```

- [ ] **Step 2: Extend the `OrderRow` interface**

Add these fields to the `OrderRow` interface (after `items` at ~line 82):

```ts
  method: string;
  paymentMethod: string;
  tax: number;
  discountAmount: number;
  deliveryFee: number;
  /** ISO timestamp used by the printed receipts (createdAt is display-only). */
  createdAtIso: string | null;
  kotPrinted: boolean;
  billRequested: boolean;
  billPrinted: boolean;
```

- [ ] **Step 3: Populate the new fields in the mapping**

In `fetchOrders`, inside the `mapped` object (after `confirmedAt:` at ~line 190-192), add:

```ts
              method: String(o.method ?? "Delivery"),
              paymentMethod: String(o.paymentMethod ?? ""),
              tax: Number(o.tax ?? 0),
              discountAmount: Number(o.discountAmount ?? 0),
              deliveryFee: Number(o.deliveryFee ?? 0),
              createdAtIso: o.createdAt ? String(o.createdAt) : null,
              kotPrinted: o.kotPrinted === true,
              billRequested: o.billRequested === true,
              billPrinted: o.billPrinted === true,
```

- [ ] **Step 4: Add the row→ReceiptOrder adapter (module scope)**

Add this function at module scope (near `formatElapsed`, ~line 25):

```ts
function receiptOrderFromRow(o: OrderRow): ReceiptOrder {
  return {
    id: o.key,
    orderNumber: o.orderNumber,
    kotNumber: o.kotNumber,
    billNumber: o.billNumber,
    createdAt: o.createdAtIso,
    method: o.method,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    totalAmount: o.totalAmount,
    discountAmount: o.discountAmount,
    deliveryFee: o.deliveryFee,
    tax: o.tax,
    receiver: {
      name: o.receiverName === "-" ? "" : o.receiverName,
      phone: o.receiverPhone === "-" ? "" : o.receiverPhone,
      address: o.receiverAddress === "-" ? "" : o.receiverAddress,
    },
    items: o.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      price: it.price,
      variantName: it.variantName,
      addOns: it.addOns ?? [],
    })),
  };
}
```

- [ ] **Step 5: Add print-station state, config fetch, ack, and the print loop**

Inside the component, add state near the other `useState` calls (~line 92):

```ts
  const [isPrintStation, setIsPrintStation] = useState(false);
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
```

Add an effect to read the toggle from localStorage on mount (near the shop-role effect, ~line 96):

```ts
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsPrintStation(localStorage.getItem(PRINT_STATION_KEY) === "1");
  }, []);
```

Add an effect to load the shop config once the station is enabled:

```ts
  useEffect(() => {
    if (!isPrintStation || shopConfig) return;
    fetch("/api/admin/print-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setShopConfig(data.config as ShopConfig);
      })
      .catch(() => {});
  }, [isPrintStation, shopConfig]);
```

Add the ack helper (a component function, near `handlePrintBill`):

```ts
  async function ackPrint(id: string, which: "kot" | "bill") {
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          [which === "kot" ? "markKotPrinted" : "markBillPrinted"]: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? which === "kot"
                ? { ...o, kotPrinted: true }
                : { ...o, billPrinted: true, billRequested: false }
              : o,
          ),
        );
      }
    } catch {
      // Ack failed -> leave flag unset so it retries on the next poll.
    } finally {
      // Clearing the guard lets a failed ack re-enqueue next poll.
      inFlightRef.current.delete(`${id}:${which}`);
    }
  }
```

Add the auto-print effect (after the config effect):

```ts
  // Print station: auto-print KOTs (on accept) and bills (on request). Only the
  // browser flagged as the station prints. An in-flight guard prevents the same
  // ticket being queued twice across polls; a failed ack clears it so the ticket
  // reprints next poll (matches the old Python agent's print-then-ack behaviour).
  useEffect(() => {
    if (!isPrintStation || !shopConfig) return;
    for (const rowOrder of orders) {
      if (rowOrder.status === "confirmed" && !rowOrder.kotPrinted) {
        const tag = `${rowOrder.key}:kot`;
        if (!inFlightRef.current.has(tag)) {
          inFlightRef.current.add(tag);
          const receipt = receiptOrderFromRow(rowOrder);
          enqueuePrint(renderKot(receipt, shopConfig), () =>
            ackPrint(rowOrder.key, "kot"),
          );
        }
      }
      if (rowOrder.billRequested && !rowOrder.billPrinted) {
        const tag = `${rowOrder.key}:bill`;
        if (!inFlightRef.current.has(tag)) {
          inFlightRef.current.add(tag);
          const receipt = receiptOrderFromRow(rowOrder);
          enqueuePrint(renderBill(receipt, shopConfig), () =>
            ackPrint(rowOrder.key, "bill"),
          );
        }
      }
    }
    // ackPrint is stable enough for this effect; orders/config/flag drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, isPrintStation, shopConfig]);
```

- [ ] **Step 6: Make Accept and Print Bill update local flags so printing fires immediately**

In `handleUpdate`, replace the `setOrders(...)` optimistic update (~line 257-274) so that confirming also seeds the print flags. Use:

```ts
        const confirming = field === "status" && value === "confirmed";
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? {
                  ...o,
                  [field]: value,
                  kotNumber:
                    data.kotNumber != null ? Number(data.kotNumber) : o.kotNumber,
                  confirmedAt:
                    data.confirmedAt != null
                      ? new Date(data.confirmedAt).getTime()
                      : o.confirmedAt,
                  ...(confirming
                    ? {
                        kotPrinted: false,
                        billNumber:
                          data.billNumber != null
                            ? Number(data.billNumber)
                            : o.billNumber,
                        billRequested: true,
                        billPrinted: false,
                      }
                    : {}),
                }
              : o,
          ),
        );
```

In `handlePrintBill`, replace its optimistic `setOrders(...)` (~line 340-352) so a reprint re-queues:

```ts
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? {
                  ...o,
                  billNumber:
                    data.billNumber != null ? Number(data.billNumber) : o.billNumber,
                  billRequested: true,
                  billPrinted: false,
                }
              : o,
          ),
        );
```

- [ ] **Step 7: Add the Print Station toggle + Test-print button to the toolbar**

Find where the page renders its header/toolbar above the `<Table ...>` (search for the `return (` of the component and the element wrapping the table). Add a controls row there:

```tsx
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Button
          type={isPrintStation ? "primary" : "default"}
          onClick={() => {
            const next = !isPrintStation;
            setIsPrintStation(next);
            localStorage.setItem(PRINT_STATION_KEY, next ? "1" : "0");
            message.info(
              next
                ? "This browser is now the print station"
                : "Print station disabled on this browser",
            );
          }}
        >
          {isPrintStation ? "Print Station: ON" : "Print Station: OFF"}
        </Button>
        {isPrintStation && (
          <Button
            onClick={() => {
              const cfg =
                shopConfig ?? {
                  shopName: "SOCHMAT",
                  orderSource: "Website",
                  legalName: "",
                  gstNo: "",
                  fssaiNo: "",
                  contact: "",
                  address: "",
                  cashier: "biller",
                };
              enqueuePrint(renderKot(SAMPLE_TICKET, cfg), () => {});
              enqueuePrint(renderBill(SAMPLE_BILL, cfg), () => {});
            }}
          >
            Test print
          </Button>
        )}
      </div>
```

(If the component currently returns the `<Table>` directly without a wrapper, wrap the returned JSX in a `<div>` so this controls row and the table are siblings.)

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/orders/page.tsx`
Expected: no errors.

- [ ] **Step 9: Manual verification**

1. `npm run dev`, log into admin, open `/admin/orders`.
2. Click **Print Station: OFF** → it flips to ON; a **Test print** button appears.
3. Click **Test print** → the browser print dialog shows a sample KOT and then a sample bill, one after the other, sized for narrow paper. Verify against the old Python `--dry-run` layout: KOT has `KOT - 1`, items with qty; bill has PAID, itemised base + add-on rows, Sub Total 330.00, Grand Total Rs. 315.00, Total Qty 2.
4. Place/accept a real test order → its KOT (and bill) auto-print. Accept a second order while the first is printing → they print sequentially, not overlapping.
5. Reload the page → already-printed orders do **not** reprint. Click **Reprint Bill** on one → it prints once.
6. Open `/admin/orders` in a second browser without enabling Print Station → it does **not** print.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/orders/page.tsx
git commit -m "feat: browser print station for KOTs and bills on admin orders page"
```

---

### Task 7: Retire the Python agent and internal print endpoints

**Files:**
- Delete: `tools/kot-print-agent/` (folder)
- Delete: `src/app/api/print/kot/route.ts`
- Delete: `src/app/api/print/bill/route.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Delete the old code**

```bash
git rm -r tools/kot-print-agent
git rm src/app/api/print/kot/route.ts src/app/api/print/bill/route.ts
rmdir src/app/api/print/kot src/app/api/print/bill src/app/api/print 2>/dev/null || true
```

- [ ] **Step 2: Remove the `/api/print/` exemption in middleware**

In `src/middleware.ts`, update the rate-limit comment (~line 42-45) and the exemption condition (~line 46). Replace:

```ts
  // Lenient blanket per-IP limit on every API request. Sensitive routes apply
  // their own stricter limits inside the handler. Fails open if Redis is down.
  // Internal print endpoints (polled by the in-store print agent) are exempt.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/print/")) {
```

with:

```ts
  // Lenient blanket per-IP limit on every API request. Sensitive routes apply
  // their own stricter limits inside the handler. Fails open if Redis is down.
  if (pathname.startsWith("/api/")) {
```

- [ ] **Step 3: Confirm nothing else references the removed paths**

Run: `grep -rn "api/print\|PRINT_AGENT_TOKEN\|kot-print-agent" src/ README.md`
Expected: no matches (the README's "Rate limiting" note mentioning `/api/print/*` may match — if so, update that sentence to drop the print-endpoint exemption reference).

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: retire Python print agent and internal /api/print endpoints"
```

---

## Operational follow-up (not code — document for the shop)

- On the shop PC, launch Chrome with `--kiosk-printing` pointed at `/admin/orders` and set the 80 mm thermal printer as the **default** printer (paper = 80 mm roll). Kiosk-printing prints silently to the default printer with no dialog. Enable **Print Station** once on that browser. This replaces the Task Scheduler / `run.bat` autostart of the Python agent.
- Set the shop-identity env vars on the deployed site: `SHOP_NAME`, `ORDER_SOURCE`, `SHOP_LEGAL_NAME`, `GST_NO`, `FSSAI_NO`, `SHOP_CONTACT`, `SHOP_ADDRESS`, `CASHIER`. `PRINT_AGENT_TOKEN` is no longer used and can be removed.

## Self-Review notes

- **Spec coverage:** §1 shop config → Task 1; §2 rendering (model + KOT + bill) → Tasks 2–3; §3 print station → Tasks 4 & 6; §4 ack endpoint → Task 5; §5 retire old path → Task 7; operational notes → follow-up section. All covered.
- **Behaviour parity:** Accept auto-queues both KOT and bill (API line 225), so Task 6 seeds `kotPrinted:false` + `billRequested:true` on confirm to reproduce today's "KOT + bill both print on accept".
- **Type consistency:** `ReceiptOrder`/`ShopConfig`/`ReceiptItem` defined in Task 1 are consumed unchanged in Tasks 2, 3, 6; `enqueuePrint(html, onPrinted)` signature is identical in Tasks 4 and 6.
