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

  it("allows multiple users with phone:\"\" (empty-string sentinel) in the same tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await createIndexes(db);

    // Two Google/email users with no real phone — both must succeed.
    await db.collection("users").insertOne({ tenantId: "A", phone: "", email: "user1@example.com" });
    await db.collection("users").insertOne({ tenantId: "A", phone: "", email: "user2@example.com" });
    expect(await db.collection("users").countDocuments({ tenantId: "A", phone: "" })).toBe(2);

    await cleanup();
  });

  it("rejects duplicate real phone within the same tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await createIndexes(db);

    await db.collection("users").insertOne({ tenantId: "A", phone: "+9111", email: "a@example.com" });
    await expect(
      db.collection("users").insertOne({ tenantId: "A", phone: "+9111", email: "b@example.com" }),
    ).rejects.toThrow();

    await cleanup();
  });
});
