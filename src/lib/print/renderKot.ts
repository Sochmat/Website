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
