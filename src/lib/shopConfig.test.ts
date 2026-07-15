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
