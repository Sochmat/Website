import { describe, it, expect } from "vitest";
import { inventoryGateRedirect } from "@/lib/adminClientAuth";

describe("inventoryGateRedirect", () => {
  it("stays put while the token is still unread, so a reload keeps the session", () => {
    // The regression: useSyncExternalStore serves the server snapshot on the
    // hydration pass, so localStorage has not been consulted yet. Treating that
    // as "logged out" bounced every reload of /inventory-management to login.
    expect(inventoryGateRedirect(undefined, null)).toBeNull();
    expect(inventoryGateRedirect(undefined, "admin")).toBeNull();
    expect(inventoryGateRedirect(undefined, "shop")).toBeNull();
  });

  it("sends a genuinely signed-out visitor to the admin login", () => {
    expect(inventoryGateRedirect(null, null)).toBe("/admin/login");
    expect(inventoryGateRedirect("", "admin")).toBe("/admin/login");
  });

  it("keeps a signed-in admin in the console", () => {
    expect(inventoryGateRedirect("1", "admin")).toBeNull();
    // Role not read back yet — still no reason to throw the admin out.
    expect(inventoryGateRedirect("1", null)).toBeNull();
  });

  it("returns the shop role to orders, which is where it belongs", () => {
    expect(inventoryGateRedirect("1", "shop")).toBe("/admin/orders");
  });
});
