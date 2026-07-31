import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import {
  claimPhoneForUser,
  backfillPhoneIfMissing,
  isPhoneAvailableFor,
} from "./userPhone";

type Doc = Record<string, unknown>;

function idEq(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) {
    return a != null && b != null && String(a) === String(b);
  }
  return a === b;
}

function matches(doc: Doc, query: Doc): boolean {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof ObjectId) &&
      "$in" in (expected as Doc)
    ) {
      return ((expected as { $in: unknown[] }).$in ?? []).some((v) =>
        idEq(actual, v),
      );
    }
    return idEq(actual, expected);
  });
}

/**
 * The slice of the Mongo API `userPhone` touches, backed by plain arrays, with
 * the unique index on `users.phone` enforced so the 11000 path is reachable.
 */
function makeDb(
  seed: Record<string, Doc[]> = {},
  /** Runs just before every write, to stage a race against the caller. */
  beforeWrite?: (store: Record<string, Doc[]>) => void,
) {
  const store: Record<string, Doc[]> = { users: [], ...seed };
  const of = (name: string) => (store[name] ??= []);

  const applySet = (name: string, doc: Doc, set: Doc) => {
    beforeWrite?.(store);
    if (name === "users" && typeof set.phone === "string") {
      const clash = of("users").some(
        (d) => d !== doc && d.phone === set.phone,
      );
      if (clash) throw Object.assign(new Error("duplicate key"), { code: 11000 });
    }
    Object.assign(doc, set);
  };

  const db = {
    collection(name: string) {
      return {
        createIndex: async () => undefined,
        findOne: async (query: Doc) =>
          of(name).find((d) => matches(d, query)) ?? null,
        updateOne: async (query: Doc, update: { $set: Doc }) => {
          const doc = of(name).find((d) => matches(d, query));
          if (doc) applySet(name, doc, update.$set);
          return { matchedCount: doc ? 1 : 0 };
        },
        updateMany: async (query: Doc, update: { $set: Doc }) => {
          const docs = of(name).filter((d) => matches(d, query));
          for (const d of docs) applySet(name, d, update.$set);
          return { modifiedCount: docs.length };
        },
        deleteOne: async (query: Doc) => {
          const i = of(name).findIndex((d) => matches(d, query));
          if (i >= 0) of(name).splice(i, 1);
          return { deletedCount: i >= 0 ? 1 : 0 };
        },
      };
    },
  } as unknown as Db;

  return { db, store };
}

const PHONE = "9876543210";

describe("claimPhoneForUser", () => {
  it("writes the phone when nobody holds it", async () => {
    const me = new ObjectId();
    const { db, store } = makeDb({
      users: [{ _id: me, email: "me@example.com" }],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("claimed");
    expect(store.users[0].phone).toBe(PHONE);
  });

  it("absorbs a shadow account and repoints its data", async () => {
    const me = new ObjectId();
    const shadow = new ObjectId();
    const orderId = new ObjectId();
    const { db, store } = makeDb({
      users: [
        { _id: me, email: "me@example.com" },
        { _id: shadow, phone: PHONE, addresses: [{ address: "Flat 4" }] },
      ],
      orders: [{ _id: orderId, userId: shadow }],
      walletTransactions: [{ userId: shadow, amount: 200 }],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("claimed");

    // The shadow is gone and the phone moved to the real account.
    expect(store.users).toHaveLength(1);
    expect(store.users[0]._id).toBe(me);
    expect(store.users[0].phone).toBe(PHONE);
    // Its data came along.
    expect(store.orders[0].userId).toBe(me);
    expect(store.walletTransactions[0].userId).toBe(me);
    expect(store.users[0].addresses).toEqual([{ address: "Flat 4" }]);
  });

  it("repoints referrals that pointed at the shadow", async () => {
    const me = new ObjectId();
    const shadow = new ObjectId();
    const referee = new ObjectId();
    const { db, store } = makeDb({
      users: [
        { _id: me, email: "me@example.com" },
        { _id: shadow, phone: PHONE },
        { _id: referee, email: "friend@example.com", referredBy: shadow },
      ],
    });

    await claimPhoneForUser(db, me, PHONE);

    const updated = store.users.find((u) => idEq(u._id, referee));
    expect(updated?.referredBy).toBe(me);
  });

  it("keeps the target's own addresses rather than the shadow's", async () => {
    const me = new ObjectId();
    const shadow = new ObjectId();
    const { db, store } = makeDb({
      users: [
        { _id: me, email: "me@example.com", addresses: [{ address: "Mine" }] },
        { _id: shadow, phone: PHONE, addresses: [{ address: "Theirs" }] },
      ],
    });

    await claimPhoneForUser(db, me, PHONE);

    expect(store.users[0].addresses).toEqual([{ address: "Mine" }]);
  });

  it("refuses a phone held by an account with an email", async () => {
    const me = new ObjectId();
    const other = new ObjectId();
    const { db, store } = makeDb({
      users: [
        { _id: me, email: "me@example.com" },
        { _id: other, email: "other@example.com", phone: PHONE },
      ],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("taken");
    expect(store.users[0].phone).toBeUndefined();
    expect(store.users).toHaveLength(2); // nothing absorbed
  });

  it("refuses a phone held by a Google account that has no email set", async () => {
    const me = new ObjectId();
    const other = new ObjectId();
    const { db } = makeDb({
      users: [
        { _id: me, email: "me@example.com" },
        { _id: other, googleId: "g-123", phone: PHONE },
      ],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("taken");
  });

  it("never overwrites a phone the account already has", async () => {
    const me = new ObjectId();
    const { db, store } = makeDb({
      users: [{ _id: me, email: "me@example.com", phone: "9000000001" }],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("unchanged");
    expect(store.users[0].phone).toBe("9000000001");
  });

  it("treats a legacy empty-string phone as absent", async () => {
    const me = new ObjectId();
    const { db, store } = makeDb({
      users: [{ _id: me, email: "me@example.com", phone: "" }],
    });

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("claimed");
    expect(store.users[0].phone).toBe(PHONE);
  });

  it("reports 'taken' when it loses the duplicate-key race", async () => {
    const me = new ObjectId();
    // The number looks free at lookup time, then a concurrent registration
    // takes it before this one writes.
    const { db, store } = makeDb(
      { users: [{ _id: me, email: "me@example.com" }] },
      (s) => {
        if (!s.users.some((u) => u.phone === PHONE)) {
          s.users.push({
            _id: new ObjectId(),
            email: "racer@example.com",
            phone: PHONE,
          });
        }
      },
    );

    expect(await claimPhoneForUser(db, me, PHONE)).toBe("taken");
    expect(store.users.find((u) => idEq(u._id, me))?.phone).toBeUndefined();
  });
});

describe("backfillPhoneIfMissing", () => {
  it("adopts a number nobody holds", async () => {
    const me = new ObjectId();
    const { db, store } = makeDb({ users: [{ _id: me, email: "me@example.com" }] });

    await backfillPhoneIfMissing(db, me, PHONE);

    expect(store.users[0].phone).toBe(PHONE);
  });

  it("leaves an account that already has a phone alone", async () => {
    const me = new ObjectId();
    const { db, store } = makeDb({
      users: [{ _id: me, email: "me@example.com", phone: "9000000001" }],
    });

    await backfillPhoneIfMissing(db, me, PHONE);

    expect(store.users[0].phone).toBe("9000000001");
  });

  it("does not absorb a shadow — ordering for a friend must not take their number", async () => {
    const me = new ObjectId();
    const shadow = new ObjectId();
    const { db, store } = makeDb({
      users: [
        { _id: me, email: "me@example.com" },
        { _id: shadow, phone: PHONE },
      ],
    });

    await backfillPhoneIfMissing(db, me, PHONE);

    expect(store.users[0].phone).toBeUndefined();
    expect(store.users).toHaveLength(2); // the shadow survives untouched
  });
});

describe("isPhoneAvailableFor", () => {
  it("is true when unheld", async () => {
    const { db } = makeDb();
    expect(await isPhoneAvailableFor(db, PHONE, "me@example.com")).toBe(true);
  });

  it("is true when held by a shadow, which registration will absorb", async () => {
    const { db } = makeDb({ users: [{ _id: new ObjectId(), phone: PHONE }] });
    expect(await isPhoneAvailableFor(db, PHONE, "me@example.com")).toBe(true);
  });

  it("is true when the caller already owns it", async () => {
    const { db } = makeDb({
      users: [{ _id: new ObjectId(), email: "me@example.com", phone: PHONE }],
    });
    expect(await isPhoneAvailableFor(db, PHONE, "me@example.com")).toBe(true);
  });

  it("is false when another account owns it", async () => {
    const { db } = makeDb({
      users: [{ _id: new ObjectId(), email: "other@example.com", phone: PHONE }],
    });
    expect(await isPhoneAvailableFor(db, PHONE, "me@example.com")).toBe(false);
  });
});
