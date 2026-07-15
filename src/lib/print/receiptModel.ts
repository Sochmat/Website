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
