import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";
import { findTenantBySlug } from "./tenant";

describe("findTenantBySlug", () => {
  it("returns an active tenant by slug", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ slug: "sochmat", name: "Sochmat", status: "active" });
    const t = await findTenantBySlug(db, "sochmat");
    expect(t?.name).toBe("Sochmat");
    await cleanup();
  });
  it("returns null for unknown slug", async () => {
    const { db, cleanup } = await withMemoryMongo();
    expect(await findTenantBySlug(db, "nope")).toBeNull();
    await cleanup();
  });
});
