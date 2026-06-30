import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../test/setup-mongo";
import { migrate } from "./migrate-to-kitchenos";

const env = {
  ADMIN_USER: "admin", ADMIN_PASSWORD: "ap",
  SHOP_USER: "shop", SHOP_PASSWORD: "sp",
  SUPERADMIN_EMAIL: "root@k.com", SUPERADMIN_PASSWORD: "rp",
  PRINT_AGENT_TOKEN: "tok", KITCHENOS_SECRET_KEY: Buffer.alloc(32).toString("base64"),
};

describe("migrate", () => {
  it("copies docs under the sochmat tenant and is idempotent", async () => {
    const src = await withMemoryMongo();
    const tgt = await withMemoryMongo();
    await src.db.collection("menuItems").insertMany([{ name: "Burger" }, { name: "Coke" }]);
    await src.db.collection("orders").insertOne({ orderNumber: "SO-1" });

    await migrate({ source: src.db, target: tgt.db, env });
    const tenant = await tgt.db.collection("tenants").findOne({ slug: "sochmat" });
    expect(tenant).toBeTruthy();
    const items = await tgt.db.collection("menuItems").find({}).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.tenantId === String(tenant!._id))).toBe(true);
    expect(await tgt.db.collection("adminUsers").countDocuments()).toBe(3); // admin, shop, super

    await migrate({ source: src.db, target: tgt.db, env }); // idempotent
    expect(await tgt.db.collection("menuItems").countDocuments()).toBe(2);

    // EXTRA (hardening): migrate must NEVER write to source.
    // tenants/adminUsers are target-only collections, so they must not appear in source.
    expect(await src.db.collection("tenants").countDocuments()).toBe(0);
    expect(await src.db.collection("adminUsers").countDocuments()).toBe(0);
    // source menuItems must not have been stamped with tenantId.
    const srcItems = await src.db.collection("menuItems").find({}).toArray();
    expect(srcItems.every((i) => i.tenantId === undefined)).toBe(true);

    await src.cleanup(); await tgt.cleanup();
  });
});
