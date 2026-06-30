import { describe, it, expect, beforeAll } from "vitest";
beforeAll(() => { process.env.ADMIN_SESSION_SECRET = "test-secret"; });

describe("session round-trip", () => {
  it("signs and verifies a session with tenant binding", async () => {
    const { createSession, verifySession } = await import("./adminAuth");
    const token = createSession({ userId: "u1", tenantId: "t1", tenantSlug: "sochmat", role: "kitchen-admin" });
    const s = await verifySession(token);
    expect(s?.tenantSlug).toBe("sochmat");
    expect(s?.role).toBe("kitchen-admin");
  });
  it("rejects a tampered token", async () => {
    const { createSession, verifySession } = await import("./adminAuth");
    const token = createSession({ userId: "u1", tenantId: "t1", tenantSlug: "sochmat", role: "shop" });
    expect(await verifySession(token + "x")).toBeNull();
  });
});
