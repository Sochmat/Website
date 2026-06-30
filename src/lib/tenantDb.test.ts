import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";

vi.mock("./mongodb", () => ({ connectToDatabase: async () => mockConn }));
let mockConn: { db: any };

import { forTenant } from "./tenantDb";

describe("forTenant isolation", () => {
  it("scopes find and insert to the tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const A = await forTenant("aaaaaaaaaaaaaaaaaaaaaaaa");
    const B = await forTenant("bbbbbbbbbbbbbbbbbbbbbbbb");
    await A.insertOne("orders", { orderNumber: "A1" });
    await B.insertOne("orders", { orderNumber: "B1" });
    const aOrders = await A.find("orders").toArray();
    expect(aOrders).toHaveLength(1);
    expect(aOrders[0].orderNumber).toBe("A1");
    expect(aOrders[0].tenantId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(await B.countDocuments("orders")).toBe(1);
    await cleanup();
  });
  it("rejects platform-level collections", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const A = await forTenant("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(() => A.raw("tenants")).toThrow();
    await cleanup();
  });
});
