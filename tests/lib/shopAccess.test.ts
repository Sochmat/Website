import { describe, expect, it } from "vitest";
import {
  SHOP_API,
  shopMayCallApi,
  shopMayOpenPage,
} from "@/lib/shopAccess";

describe("shopMayOpenPage", () => {
  it("allows the three screens the kitchen works from", () => {
    expect(shopMayOpenPage("/admin/orders")).toBe(true);
    expect(shopMayOpenPage("/admin/menu")).toBe(true);
    expect(shopMayOpenPage("/admin/add-stock")).toBe(true);
  });

  it("refuses the rest of the admin console", () => {
    expect(shopMayOpenPage("/admin/dashboard")).toBe(false);
    expect(shopMayOpenPage("/admin/users")).toBe(false);
    expect(shopMayOpenPage("/admin/payment-logs")).toBe(false);
    expect(shopMayOpenPage("/inventory-management/add-stock")).toBe(false);
  });

  it("covers sub-paths of an allowed page", () => {
    expect(shopMayOpenPage("/admin/orders/12345")).toBe(true);
  });

  it("does not treat a shared prefix as a sub-path", () => {
    // "/admin/menus" starts with "/admin/menu" as a string but is a different
    // route; only a full segment boundary counts.
    expect(shopMayOpenPage("/admin/menus")).toBe(false);
    expect(shopMayOpenPage("/admin/add-stock-report")).toBe(false);
  });
});

describe("shopMayCallApi", () => {
  it("allows reading and hiding menu items", () => {
    expect(shopMayCallApi("/api/admin/menu", "GET")).toBe(true);
    expect(shopMayCallApi("/api/admin/menu", "PUT")).toBe(true);
    expect(shopMayCallApi("/api/admin/menu/abc123", "PUT")).toBe(true);
  });

  it("refuses methods that are not listed for an allowed path", () => {
    // The shop may hide an item; it may not create or delete one.
    expect(shopMayCallApi("/api/admin/menu", "POST")).toBe(false);
    expect(shopMayCallApi("/api/admin/menu", "DELETE")).toBe(false);
  });

  it("allows categories and add-on categories read-only", () => {
    expect(shopMayCallApi("/api/admin/categories", "GET")).toBe(true);
    expect(shopMayCallApi("/api/admin/categories", "POST")).toBe(false);
    expect(shopMayCallApi("/api/admin/addon-categories", "GET")).toBe(true);
    expect(shopMayCallApi("/api/admin/addon-categories", "POST")).toBe(false);
    // The reorder endpoint sits under the allowed prefix but is a write, so
    // the method list is what stops it.
    expect(shopMayCallApi("/api/admin/addon-categories/order", "POST")).toBe(
      false,
    );
  });

  it("allows moving an order along but not editing it wholesale", () => {
    expect(shopMayCallApi("/api/admin/orders", "GET")).toBe(true);
    expect(shopMayCallApi("/api/admin/orders", "PATCH")).toBe(true);
    expect(shopMayCallApi("/api/admin/orders", "DELETE")).toBe(false);
  });

  it("allows the Add Stock screen's two calls and nothing else in inventory", () => {
    expect(shopMayCallApi("/api/inventory/production-items", "GET")).toBe(true);
    expect(shopMayCallApi("/api/inventory/stock-additions", "POST")).toBe(true);
    // Creating or editing a production item is setup work, not kitchen work.
    expect(shopMayCallApi("/api/inventory/production-items", "POST")).toBe(
      false,
    );
    expect(shopMayCallApi("/api/inventory/raw-materials", "GET")).toBe(false);
    expect(shopMayCallApi("/api/inventory/stock-adjustments", "POST")).toBe(
      false,
    );
    expect(shopMayCallApi("/api/inventory/wastages", "POST")).toBe(false);
  });

  it("refuses admin endpoints it was never given", () => {
    expect(shopMayCallApi("/api/admin/users", "GET")).toBe(false);
    expect(shopMayCallApi("/api/admin/coupons", "GET")).toBe(false);
    expect(shopMayCallApi("/api/admin/payment-logs", "GET")).toBe(false);
    expect(shopMayCallApi("/api/admin/dashboard", "GET")).toBe(false);
  });

  it("keeps the store and delivery toggles admin-only", () => {
    // Both are POST-only writes; the shop reads the state from the public
    // /api/store-status, which is not gated here at all.
    expect(shopMayCallApi("/api/admin/store-status", "POST")).toBe(false);
    expect(shopMayCallApi("/api/admin/delivery-status", "POST")).toBe(false);
  });

  it("lets the shop log itself out", () => {
    expect(shopMayCallApi("/api/admin/logout", "POST")).toBe(true);
  });

  it("matches the method case-insensitively", () => {
    expect(shopMayCallApi("/api/admin/menu", "get")).toBe(true);
  });

  it("is an allowlist, so an unknown path is closed by default", () => {
    expect(shopMayCallApi("/api/admin/something-new", "GET")).toBe(false);
    expect(shopMayCallApi("/api/inventory/something-new", "GET")).toBe(false);
  });

  it("prefers the longest matching prefix", () => {
    // Nothing overrides today, but the rule must hold so a narrower entry can
    // be added later without depending on key order.
    const longest = Object.keys(SHOP_API).filter((base) =>
      "/api/admin/menu/abc".startsWith(base),
    );
    expect(longest).toEqual(["/api/admin/menu"]);
  });
});
