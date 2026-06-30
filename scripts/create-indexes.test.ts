import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../test/setup-mongo";
import { createIndexes } from "./create-indexes";

describe("createIndexes", () => {
  it("creates per-tenant unique order index", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await createIndexes(db);
    await db.collection("orders").insertOne({ tenantId: "A", orderNumber: "1" });
    await expect(
      db.collection("orders").insertOne({ tenantId: "A", orderNumber: "1" }),
    ).rejects.toThrow();
    // same orderNumber under a different tenant is allowed
    await db.collection("orders").insertOne({ tenantId: "B", orderNumber: "1" });
    expect(await db.collection("orders").countDocuments()).toBe(2);
    await cleanup();
  });
});
