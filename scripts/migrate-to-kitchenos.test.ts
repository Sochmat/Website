import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../test/setup-mongo";
import { migrate, preflightDupCheck } from "./migrate-to-kitchenos";

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

describe("preflightDupCheck", () => {
  it("passes when source has no duplicates (including phone-less users)", async () => {
    const { db: source, cleanup } = await withMemoryMongo();

    await source.collection("users").insertMany([
      { name: "Alice", phone: "9999900001" },
      { name: "Bob", phone: "9999900002" },
      { name: "Google User 1", email: "g1@example.com" }, // no phone
      { name: "Google User 2", email: "g2@example.com" }, // no phone
    ]);
    await source.collection("orders").insertMany([
      { orderNumber: 1 },
      { orderNumber: 2 },
    ]);
    await source.collection("coupons").insertMany([
      { code: "SAVE10" },
      { code: "FREESHIP" },
    ]);

    await expect(preflightDupCheck(source)).resolves.toBeUndefined();
    await cleanup();
  });

  it("throws when source has duplicate non-null phone", async () => {
    const { db: source, cleanup } = await withMemoryMongo();

    await source.collection("users").insertMany([
      { name: "Alice", phone: "9999900001" },
      { name: "Alice Dup", phone: "9999900001" }, // duplicate!
    ]);

    await expect(preflightDupCheck(source)).rejects.toThrow(
      /duplicate non-null phone/
    );
    await cleanup();
  });

  it("throws when source has duplicate orderNumber", async () => {
    const { db: source, cleanup } = await withMemoryMongo();

    await source.collection("orders").insertMany([
      { orderNumber: 42 },
      { orderNumber: 42 }, // duplicate!
    ]);

    await expect(preflightDupCheck(source)).rejects.toThrow(
      /duplicate orderNumber/
    );
    await cleanup();
  });

  it("throws when source has duplicate coupon code", async () => {
    const { db: source, cleanup } = await withMemoryMongo();

    await source.collection("coupons").insertMany([
      { code: "SAVE10", active: true },
      { code: "SAVE10", active: false }, // duplicate!
    ]);

    await expect(preflightDupCheck(source)).rejects.toThrow(
      /duplicate code/
    );
    await cleanup();
  });

  it("does NOT throw for multiple phone-less users (null/missing phone)", async () => {
    const { db: source, cleanup } = await withMemoryMongo();

    // Multiple users with no phone — must not trigger dup check (partial index rule).
    await source.collection("users").insertMany([
      { name: "Google User 1", email: "g1@example.com" },
      { name: "Google User 2", email: "g2@example.com" },
      { name: "Google User 3", email: "g3@example.com" },
    ]);

    await expect(preflightDupCheck(source)).resolves.toBeUndefined();
    await cleanup();
  });
});
