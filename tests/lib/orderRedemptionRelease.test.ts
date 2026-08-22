// A checkout that fails must not cost the customer their wallet credit or
// reward points.
//
// The balances are reserved (decremented) when the order is created, so a
// failed payment that just walks away leaves them locked to a dead order — and
// the retry is a NEW order, so they are missing from the very next attempt.
// Releasing them puts them straight back; the frozen Razorpay amount is what
// keeps a payment that captures LATE reconcilable against the reduced figure it
// was raised for, and the re-apply retakes what the release gave back.
//
// The release/re-apply pair runs here for real against a stub Db.

import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { expectedChargePaise } from "@/lib/orderAmounts";
import {
  reapplyOrderRedemptions,
  refundOrderRedemptions,
} from "@/lib/orderRedemption";

type Doc = Record<string, unknown>;
/** A mongo filter or update as the code under test writes it. */
type Query = Record<string, unknown>;

/**
 * Enough of a Db for the redemption path: orders (findOneAndUpdate with both a
 * pipeline and a plain update, updateOne, findOne) and users (guarded $inc),
 * plus the two ledgers, which are append-only here.
 */
function stubDb(orders: Doc[], users: Doc[]) {
  const ledgers: Record<string, Doc[]> = {
    walletTransactions: [],
    rewardTransactions: [],
  };

  const matches = (doc: Doc, filter: Query): boolean =>
    Object.entries(filter).every(([key, cond]) => {
      if (key === "$or") {
        return (cond as Query[]).some((c) => matches(doc, c));
      }
      const value = doc[key];
      if (cond && typeof cond === "object" && !(cond instanceof ObjectId)) {
        const c = cond as Query;
        if ("$ne" in c) return String(value) !== String(c.$ne);
        if ("$gt" in c) return Number(value ?? 0) > Number(c.$gt);
        if ("$gte" in c) return Number(value ?? 0) >= Number(c.$gte);
        if ("$exists" in c) return (value !== undefined) === c.$exists;
      }
      if (value instanceof ObjectId || cond instanceof ObjectId) {
        return String(value) === String(cond);
      }
      return value === cond;
    });

  /** The pipeline stage refundOrderRedemptions uses, resolved against a doc. */
  const resolve = (doc: Doc, expr: unknown): unknown => {
    if (typeof expr === "string" && expr.startsWith("$$NOW")) return new Date();
    if (typeof expr === "string" && expr.startsWith("$")) {
      return doc[expr.slice(1)];
    }
    if (expr && typeof expr === "object" && !Array.isArray(expr)) {
      const obj = expr as Query;
      if ("$ifNull" in obj) {
        const [value, fallback] = obj.$ifNull as unknown[];
        return resolve(doc, value) ?? resolve(doc, fallback);
      }
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, resolve(doc, v)]),
      );
    }
    return expr;
  };

  const applyUpdate = (doc: Doc, update: Query | Query[]) => {
    if (Array.isArray(update)) {
      for (const stage of update) {
        for (const [key, expr] of Object.entries((stage.$set ?? {}) as Query)) {
          doc[key] = resolve(doc, expr);
        }
      }
      return;
    }
    Object.assign(doc, (update.$set ?? {}) as Query);
    for (const [key, delta] of Object.entries((update.$inc ?? {}) as Query)) {
      doc[key] = Number(doc[key] ?? 0) + Number(delta);
    }
    for (const key of Object.keys((update.$unset ?? {}) as Query)) {
      delete doc[key];
    }
  };

  const collection = (rows: Doc[]) => ({
    findOne: async (filter: Query) =>
      rows.find((r) => matches(r, filter)) ?? null,
    updateOne: async (filter: Query, update: Query) => {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(row, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    findOneAndUpdate: async (filter: Query, update: Query | Query[]) => {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return null;
      const before = { ...row }; // shallow: ObjectIds must stay ObjectIds
      applyUpdate(row, update);
      return before; // every caller here asks for returnDocument: "before"
    },
    insertOne: async (doc: Doc) => {
      rows.push(doc);
      return { insertedId: doc._id };
    },
  });

  const db = {
    collection(name: string) {
      if (name === "orders") return collection(orders);
      if (name === "users") return collection(users);
      return collection((ledgers[name] ??= []));
    },
  } as unknown as Db;

  return { db, ledgers };
}

const USER = new ObjectId();
const ORDER = new ObjectId();
const RAZORPAY_ORDER = "order_LiveOne";

/** ₹500 bill, ₹100 wallet + 50 points applied, so ₹350 reached Razorpay. */
function scenario(walletBalance = 0, rewardPoints = 0) {
  const order: Doc = {
    _id: ORDER,
    userId: USER,
    paymentStatus: "pending",
    totalAmount: 500,
    walletApplied: 100,
    pointsApplied: 50,
    amountPayable: 350,
    netAmount: 350,
    razorpayOrderId: RAZORPAY_ORDER,
    razorpayAmountPaise: 35000,
  };
  const user: Doc = { _id: USER, walletBalance, rewardPoints };
  return { order, user, ...stubDb([order], [user]) };
}

describe("releasing a failed checkout's redemption", () => {
  it("returns wallet credit and points to the customer", async () => {
    const { db, order, user, ledgers } = scenario();

    const returned = await refundOrderRedemptions(db, ORDER);

    expect(returned).toEqual({ wallet: 100, points: 50 });
    expect(user.walletBalance).toBe(100);
    expect(user.rewardPoints).toBe(50);
    // The order stands at its full bill again, and remembers what it gave back.
    expect(order.walletApplied).toBe(0);
    expect(order.pointsApplied).toBe(0);
    expect(order.netAmount).toBe(500);
    expect(order.redemptionReleased).toMatchObject({ wallet: 100, points: 50 });
    expect(ledgers.walletTransactions).toHaveLength(1);
    expect(ledgers.rewardTransactions).toHaveLength(1);
  });

  it("is idempotent — a second release credits nothing", async () => {
    const { db, user } = scenario();

    await refundOrderRedemptions(db, ORDER);
    const again = await refundOrderRedemptions(db, ORDER);

    expect(again).toEqual({ wallet: 0, points: 0 });
    expect(user.walletBalance).toBe(100);
    expect(user.rewardPoints).toBe(50);
  });

  it("keeps the released order reconcilable at the amount it was raised for", async () => {
    const { db, order } = scenario();

    await refundOrderRedemptions(db, ORDER);

    // netAmount is back at ₹500, but the payment in flight is for ₹350.
    expect(expectedChargePaise(order, RAZORPAY_ORDER)).toBe(35000);
    // A retry raises its own Razorpay order; the stale figure must not vouch.
    expect(expectedChargePaise(order, "order_Retry")).toBe(50000);
  });
});

describe("a payment that captures after the release", () => {
  it("retakes exactly what was returned", async () => {
    const { db, order, user } = scenario();
    await refundOrderRedemptions(db, ORDER);

    const retaken = await reapplyOrderRedemptions(db, ORDER);

    expect(retaken).toEqual({ wallet: 100, points: 50, shortfall: null });
    expect(user.walletBalance).toBe(0);
    expect(user.rewardPoints).toBe(0);
    expect(order.walletApplied).toBe(100);
    expect(order.pointsApplied).toBe(50);
    expect(order.netAmount).toBe(350);
    expect(order.redemptionReleased).toBeUndefined();
  });

  it("cannot be retaken twice when verify races the webhook", async () => {
    const { db, user } = scenario();
    await refundOrderRedemptions(db, ORDER);

    await reapplyOrderRedemptions(db, ORDER);
    const second = await reapplyOrderRedemptions(db, ORDER);

    expect(second).toEqual({ wallet: 0, points: 0, shortfall: null });
    expect(user.walletBalance).toBe(0);
    expect(user.rewardPoints).toBe(0);
  });

  it("reports a shortfall rather than driving a balance negative", async () => {
    const { db, order, user } = scenario();
    await refundOrderRedemptions(db, ORDER);
    // The customer spent the returned points elsewhere before this landed.
    user.rewardPoints = 10;

    const retaken = await reapplyOrderRedemptions(db, ORDER);

    expect(retaken.wallet).toBe(100);
    expect(retaken.points).toBe(0);
    expect(retaken.shortfall).toEqual({ wallet: 0, points: 50 });
    expect(user.rewardPoints).toBe(10); // untouched, never negative
    // The order shows what was really redeemed, so the gap is visible.
    expect(order.pointsApplied).toBe(0);
    expect(order.netAmount).toBe(400);
    expect(order.redemptionShortfall).toEqual({ wallet: 0, points: 50 });
  });

  it("does nothing for an order that was never released", async () => {
    const { db, order, user } = scenario(200, 200);

    const retaken = await reapplyOrderRedemptions(db, ORDER);

    expect(retaken).toEqual({ wallet: 0, points: 0, shortfall: null });
    expect(user.walletBalance).toBe(200);
    expect(order.walletApplied).toBe(100);
  });
});

describe("expectedChargePaise", () => {
  it("falls back to netAmount for orders that predate the freeze", () => {
    expect(
      expectedChargePaise({ totalAmount: 500, netAmount: 350 }, "order_X"),
    ).toBe(35000);
  });

  it("falls back to the bill when there is no netAmount either", () => {
    expect(expectedChargePaise({ totalAmount: 500 }, "order_X")).toBe(50000);
  });
});
