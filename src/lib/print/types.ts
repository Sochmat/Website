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
