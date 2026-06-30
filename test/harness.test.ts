import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "./setup-mongo";

describe("harness", () => {
  it("connects to memory mongo", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("ping").insertOne({ ok: 1 });
    expect(await db.collection("ping").countDocuments()).toBe(1);
    await cleanup();
  });
});
