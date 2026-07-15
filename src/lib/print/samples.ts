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
