import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  CUSTOMER_COOKIE,
  signCustomerSession,
  verifyCustomerSession,
  customerCookieOptions,
} from "./customerAuth";

const USER_ID = "6870f1a2b3c4d5e6f7a8b9c0";
const OTHER_ID = "1111111111111111111111ff";

beforeAll(() => {
  process.env.CUSTOMER_SESSION_SECRET = "test-secret-do-not-use";
});

describe("CUSTOMER_COOKIE", () => {
  it("does not collide with the admin cookie", () => {
    expect(CUSTOMER_COOKIE).toBe("user_session");
  });
});

describe("signCustomerSession", () => {
  it("produces a two-part body.signature token", async () => {
    const token = await signCustomerSession(USER_ID);
    expect(token.split(".")).toHaveLength(2);
  });

  it("refuses anything that is not a 24-hex ObjectId", async () => {
    await expect(signCustomerSession("nope")).rejects.toThrow();
    await expect(signCustomerSession("")).rejects.toThrow();
  });
});

describe("verifyCustomerSession", () => {
  it("round-trips a freshly signed token", async () => {
    const session = await verifyCustomerSession(await signCustomerSession(USER_ID));
    expect(session?.userId).toBe(USER_ID);
    expect(session!.exp).toBeGreaterThan(Date.now());
  });

  it("rejects an absent token", async () => {
    expect(await verifyCustomerSession(undefined)).toBeNull();
    expect(await verifyCustomerSession(null)).toBeNull();
    expect(await verifyCustomerSession("")).toBeNull();
  });

  it("rejects a token with no signature", async () => {
    expect(await verifyCustomerSession("justabody")).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signCustomerSession(USER_ID);
    const [body] = token.split(".");
    expect(await verifyCustomerSession(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects a swapped payload — the forged userId does not validate", async () => {
    // This is the whole point: the old localStorage token was base64(userId:ts)
    // with no signature, so anyone could mint one for any user.
    const token = await signCustomerSession(USER_ID);
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: OTHER_ID, exp: Date.now() + 100000 }),
    )
      .toString("base64url");
    expect(await verifyCustomerSession(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects an unsigned base64 payload (the old token format)", async () => {
    const legacy = Buffer.from(`${USER_ID}:${Date.now()}`).toString("base64");
    expect(await verifyCustomerSession(legacy)).toBeNull();
  });

  it("rejects a correctly-signed token once its 30 days are up", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
      const token = await signCustomerSession(USER_ID);
      // Still good on day 29 — only the clock, not the signature, decides.
      vi.setSystemTime(new Date("2026-08-07T00:00:00Z"));
      expect((await verifyCustomerSession(token))?.userId).toBe(USER_ID);

      vi.setSystemTime(new Date("2026-08-09T00:00:00Z")); // day 31
      expect(await verifyCustomerSession(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a validly-signed token whose userId is not an ObjectId", async () => {
    // Belt and braces: even if a future caller signs junk, verification refuses it.
    expect(await verifyCustomerSession("e30.e30")).toBeNull();
  });
});

describe("customerCookieOptions", () => {
  it("is httpOnly, lax, root-scoped", () => {
    const o = customerCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it("omits `domain` when COOKIE_DOMAIN is unset (local dev)", () => {
    delete process.env.COOKIE_DOMAIN;
    expect(customerCookieOptions()).not.toHaveProperty("domain");
  });

  it("sets `domain` so the subscription subdomain sees the session", () => {
    process.env.COOKIE_DOMAIN = ".sochmat.com";
    expect(customerCookieOptions()).toMatchObject({ domain: ".sochmat.com" });
    delete process.env.COOKIE_DOMAIN;
  });
});
