import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../../../../test/setup-mongo";
import { hashPassword } from "@/lib/password";
import { authenticate } from "./authenticate";

describe("authenticate", () => {
  it("logs in a kitchen-admin within their tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ _id: "t1" as any, slug: "sochmat", status: "active" });
    await db.collection("adminUsers").insertOne({
      tenantId: "t1", email: "a@s.com", role: "kitchen-admin", name: "A",
      passwordHash: await hashPassword("pw"),
    });
    const s = await authenticate(db, { kind: "tenant", slug: "sochmat" }, "a@s.com", "pw");
    expect(s?.role).toBe("kitchen-admin");
    expect(s?.tenantSlug).toBe("sochmat");
    await cleanup();
  });
  it("rejects wrong tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ _id: "t1" as any, slug: "sochmat", status: "active" });
    await db.collection("adminUsers").insertOne({
      tenantId: "t1", email: "a@s.com", role: "kitchen-admin", name: "A",
      passwordHash: await hashPassword("pw"),
    });
    expect(await authenticate(db, { kind: "tenant", slug: "other" }, "a@s.com", "pw")).toBeNull();
    await cleanup();
  });
  it("logs in superadmin only on super scope", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("adminUsers").insertOne({
      tenantId: null, email: "root@k.com", role: "superadmin", name: "Root",
      passwordHash: await hashPassword("pw"),
    });
    expect((await authenticate(db, { kind: "super" }, "root@k.com", "pw"))?.role).toBe("superadmin");
    expect(await authenticate(db, { kind: "tenant", slug: "sochmat" }, "root@k.com", "pw")).toBeNull();
    await cleanup();
  });
});
