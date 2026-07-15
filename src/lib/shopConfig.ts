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
