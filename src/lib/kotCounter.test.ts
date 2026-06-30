import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";
vi.mock("./mongodb", () => ({ connectToDatabase: async () => mockConn }));
let mockConn: { db: any };
import { nextKotNumber } from "./kotCounter";

describe("nextKotNumber", () => {
  it("keeps independent sequences per tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const a1 = await nextKotNumber("A");
    const a2 = await nextKotNumber("A");
    const b1 = await nextKotNumber("B");
    expect(a1).toBe(1); expect(a2).toBe(2); expect(b1).toBe(1);
    await cleanup();
  });
});
