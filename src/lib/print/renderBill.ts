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
