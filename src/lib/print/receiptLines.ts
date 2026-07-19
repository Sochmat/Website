import type { ReceiptOrder, ShopConfig } from "@/lib/print/types";
import {
  computeBillTotals,
  formatIstDateTime,
  splitItemPricing,
  titleCase,
} from "@/lib/print/receiptModel";

/**
 * A single receipt line for the bitmap renderer. Text is laid out in a
 * fixed-width monospace grid (like the retired Python agent) so two-column
 * rows align; the rasterizer only positions/sizes the string.
 */
export interface ReceiptLine {
  text: string;
  align?: "left" | "center";
  bold?: boolean;
  /** Emphasised (large) line — shop name, KOT number. */
  large?: boolean;
  /** Horizontal dashed divider; `text` is ignored. */
  rule?: boolean;
}

/** Monospace columns across the printable width, per the old Python agent. */
export const KOT_COLS = 32; // font A
export const BILL_COLS = 42; // smaller font B

/** Format a two-column row: label left, value right, padded to `cols`. */
function two(label: string, value: string, cols: number): string {
  const maxLabel = cols - value.length - 1;
  let l = label;
  if (l.length > maxLabel) l = l.slice(0, Math.max(0, maxLabel));
  const gap = cols - l.length - value.length;
  return l + " ".repeat(Math.max(1, gap)) + value;
}

/**
 * A dish/add-on row for the KOT: label + right-aligned qty, wrapping the label
 * across extra lines when it is too long (qty stays on the first line).
 */
function itemRows(label: string, value: string, cols: number): ReceiptLine[] {
  const nameW = cols - 4; // reserve 4 columns for the qty, matching the agent
  if (label.length <= nameW) {
    return [{ text: two(label, value, cols), bold: true }];
  }
  const out: ReceiptLine[] = [];
  for (let i = 0; i < label.length; i += nameW) {
    const chunk = label.slice(i, i + nameW);
    out.push(
      i === 0
        ? { text: two(chunk, value, cols), bold: true }
        : { text: chunk, bold: true },
    );
  }
  return out;
}

const RULE: ReceiptLine = { text: "", rule: true };

/** Word-wrap a string to `cols`, hard-splitting any word longer than a line. */
function wrap(text: string, cols: number): string[] {
  if (text.length <= cols) return [text];
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    let w = word;
    // Hard-split a single word that cannot fit on one line.
    while (w.length > cols) {
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(w.slice(0, cols));
      w = w.slice(cols);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= cols) line += " " + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Wrap any over-wide free-text lines to `cols` so nothing is clipped on the
 * right. Column-padded rows are already exactly `cols` wide and pass through.
 */
function fitWidth(lines: ReceiptLine[], cols: number): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const l of lines) {
    if (l.rule || l.text.length <= cols) {
      out.push(l);
      continue;
    }
    for (const text of wrap(l.text, cols)) out.push({ ...l, text });
  }
  return out;
}

/** Build the KOT line model (kitchen order ticket). */
export function kotLines(order: ReceiptOrder, cfg: ShopConfig): ReceiptLine[] {
  const { full } = formatIstDateTime(order.createdAt);
  const L: ReceiptLine[] = [];

  L.push({ text: `From: ${cfg.orderSource}`, align: "center", bold: true });
  L.push({ text: cfg.shopName, align: "center", large: true, bold: true });
  L.push({ text: full, align: "center" });
  L.push({
    text: order.kotNumber != null ? `KOT - ${order.kotNumber}` : "KOT",
    align: "center",
    large: true,
    bold: true,
  });
  L.push({ text: `Order ID: ${order.orderNumber}`, align: "center" });
  L.push({ text: `Method: ${order.method}`, align: "center", bold: true });
  L.push(RULE);
  L.push({ text: two("Item", "Qty", KOT_COLS) });
  L.push(RULE);

  for (const item of order.items) {
    const qty = Math.trunc(item.quantity || 0);
    L.push(...itemRows(item.name, String(qty), KOT_COLS));
    if (item.variantName) L.push({ text: `  (${item.variantName})` });
    for (const addOn of item.addOns ?? []) {
      const addQty = Math.trunc(addOn.quantity || 0) * qty;
      L.push(...itemRows(`+ ${addOn.name}`, String(addQty), KOT_COLS));
    }
  }

  L.push(RULE);
  const pay = order.paymentMethod
    ? `Payment : ${order.paymentMethod} (${order.paymentStatus})`
    : `Payment : ${order.paymentStatus}`;
  L.push({ text: pay });
  L.push({
    text: `Customer: ${order.receiver.name} ${order.receiver.phone}`.trim(),
  });
  L.push(RULE);
  L.push({ text: `Total   : Rs. ${order.totalAmount}`, bold: true });

  if (cfg.fssaiNo || cfg.gstNo) {
    L.push(RULE);
    if (cfg.fssaiNo) L.push({ text: `FSSAI No: ${cfg.fssaiNo}`, align: "center" });
    if (cfg.gstNo) L.push({ text: `GST No: ${cfg.gstNo}`, align: "center" });
  }

  return fitWidth(L, KOT_COLS);
}

/** Build the customer bill line model. */
export function billLines(order: ReceiptOrder, cfg: ShopConfig): ReceiptLine[] {
  const totals = computeBillTotals(order);
  const paid = (order.paymentStatus || "").toLowerCase() === "paid";
  const { date, time } = formatIstDateTime(order.createdAt);
  const L: ReceiptLine[] = [];

  L.push({ text: paid ? "PAID" : "UNPAID", align: "center", bold: true });
  if (cfg.legalName) L.push({ text: cfg.legalName, align: "center", bold: true });
  if (cfg.gstNo) L.push({ text: `GST No:-${cfg.gstNo}`, align: "center" });
  if (cfg.fssaiNo) L.push({ text: `FSSAI:-${cfg.fssaiNo}`, align: "center" });

  L.push(RULE);
  L.push({ text: `From ${cfg.orderSource}[${order.orderNumber}]` });
  L.push({ text: `Name: ${order.receiver.name}` });
  if (order.receiver.phone) L.push({ text: `Phone: ${order.receiver.phone}` });
  if (order.receiver.address)
    L.push({ text: `Address: ${order.receiver.address}` });

  L.push(RULE);
  L.push({ text: two(`Date: ${date}`, order.method, BILL_COLS), bold: true });
  L.push({ text: time });
  L.push({
    text: two(`Cashier: ${cfg.cashier}`, `Bill No.: ${order.billNumber ?? "-"}`, BILL_COLS),
  });

  L.push(RULE);
  L.push({ text: two("Item", "Qty x Price   Amount", BILL_COLS) });
  L.push(RULE);

  for (const item of order.items) {
    const p = splitItemPricing(item);
    L.push({ text: p.name, bold: true });
    if (p.variantName) L.push({ text: `  (${p.variantName})` });
    L.push({
      text: two(`  ${p.quantity} x ${p.basePrice.toFixed(2)}`, p.baseAmount.toFixed(2), BILL_COLS),
    });
    for (const addOn of p.addOns) {
      L.push({ text: `+ ${addOn.name}`, bold: true });
      L.push({
        text: two(
          `  ${addOn.quantity} x ${addOn.unitPrice.toFixed(2)}`,
          addOn.amount.toFixed(2),
          BILL_COLS,
        ),
      });
    }
  }

  L.push(RULE);
  L.push({ text: two("Sub Total", totals.subTotal.toFixed(2), BILL_COLS) });
  if (totals.discount)
    L.push({ text: two("Discount", `(${totals.discount.toFixed(2)})`, BILL_COLS) });
  if (totals.deliveryFee)
    L.push({ text: two("Delivery Charge", totals.deliveryFee.toFixed(2), BILL_COLS) });
  if (totals.cgst) L.push({ text: two("CGST @2.5%", totals.cgst.toFixed(2), BILL_COLS) });
  if (totals.sgst) L.push({ text: two("SGST @2.5%", totals.sgst.toFixed(2), BILL_COLS) });
  if (Math.abs(totals.roundOff) >= 0.01) {
    const sign = totals.roundOff >= 0 ? "+" : "";
    L.push({ text: two("Round off", `${sign}${totals.roundOff.toFixed(2)}`, BILL_COLS) });
  }

  L.push(RULE);
  L.push({ text: two("Grand Total", `Rs. ${totals.grandTotal.toFixed(2)}`, BILL_COLS), bold: true });
  L.push({ text: `Total Qty: ${totals.totalQty}` });
  L.push({
    text: paid
      ? `Paid via ${titleCase(order.paymentMethod)}`
      : `Payment: ${order.paymentStatus}`,
  });

  if (cfg.contact || cfg.address) {
    L.push(RULE);
    if (cfg.contact) L.push({ text: `Contact:- ${cfg.contact}`, align: "center" });
    if (cfg.address) L.push({ text: cfg.address, align: "center" });
  }
  L.push({ text: "Thanks for Ordering....!!", align: "center" });

  return fitWidth(L, BILL_COLS);
}
