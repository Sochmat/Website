# Reward Points with Daily Order Streak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Award à-la-carte customers reward points as a percentage of their pre-tax bill, where the percentage climbs 10 → 12 → 14 → 16 → 18 → 20% with their consecutive daily ordering streak, and let them spend the whole balance on a later order.

**Architecture:** A pure, client-safe math module (`src/lib/rewards.ts`) holds the ladder and streak rules so checkout previews exactly what the server later awards; a server-only module (`src/lib/rewardPoints.ts`) holds the DB operations. Streak state is computed on read from a stored `streakLastDate` — there is no cron. Earning hooks into the single idempotent "order became paid" block in `reconcilePayment`; redemption mirrors the existing wallet reservation, guarded on balance so it cannot double-spend.

**Tech Stack:** Next.js 16 (App Router), React 19, MongoDB (driver v7), TypeScript, vitest, antd v6 (admin only), Tailwind v4 (customer-facing).

**Spec:** `docs/superpowers/specs/2026-07-25-reward-points-streak-design.md`

## Global Constraints

- **1 point = ₹1.** Balances and applied amounts are always whole integers.
- **Earn base is the pre-tax total after discounts** — item subtotal less offer discount and location discount, before GST and before the delivery fee. Never trust the client for it.
- **`MIN_PAYABLE = 1`** (from `src/lib/walletMath.ts`) is shared: wallet credit *plus* reward points together must always leave at least ₹1 payable, because Razorpay cannot charge ₹0.
- **Wallet applies first, then points**, so the existing wallet path is unchanged.
- **IST calendar dates are `yyyy-mm-dd` strings.** All date maths uses `src/lib/ist.ts`. Per that file's convention, **no function reads the clock** — callers inject `now` or `today`.
- **Rate ladder is `[10, 12, 14, 16, 18, 20]`**, indexed by streak day; streak day 6 and beyond all earn the 20% cap.
- **Saturdays, Sundays, and admin-set holiday dates never break a streak.**
- **Scope is à-la-carte only.** No file under `src/app/subscribe`, `src/app/subscription`, or `src/lib/subscription*.ts` is modified by this plan.
- **Run tests with** `npx vitest run` (the repo script is `npm test`). Lint with `npm run lint`.
- Commit messages use lowercase conventional prefixes (`feat:`, `refactor:`), matching the existing log.

---

### Task 1: Pure reward math module

The ladder, the streak transition, and the two money helpers. Pure functions only — no DB import, no clock read — so `src/app/order/page.tsx` can import this for its preview.

**Files:**
- Create: `src/lib/rewards.ts`
- Test: `src/lib/rewards.test.ts`

**Interfaces:**
- Consumes: `addIstDays`, `istDaysBetween`, `istWeekday` from `src/lib/ist.ts`; `MIN_PAYABLE` from `src/lib/walletMath.ts`.
- Produces:
  - `POINT_RATES: number[]`, `MAX_POINT_RATE: number`
  - `interface StreakState { count: number; lastDate: string }`
  - `rateForStreak(streak: number): number`
  - `isExemptDay(date: string, exemptDates: Set<string>): boolean`
  - `nextStreak(prev: StreakState | null, today: string, exemptDates: Set<string>): number`
  - `computePointsEarned(rewardBase: number, rate: number): number`
  - `computePointsApplied(balance: number, payableAfterWallet: number): { pointsApplied: number; amountPayable: number }`
  - `sanitizeExemptDates(input: unknown): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/rewards.test.ts`. Note the fixture dates: `2026-07-20` is a Monday, `2026-07-24` a Friday, `2026-07-25` a Saturday, `2026-07-26` a Sunday, `2026-07-27` a Monday.

```ts
import { describe, it, expect } from "vitest";
import {
  POINT_RATES,
  MAX_POINT_RATE,
  rateForStreak,
  isExemptDay,
  nextStreak,
  computePointsEarned,
  computePointsApplied,
  sanitizeExemptDates,
} from "./rewards";

const NO_HOLIDAYS = new Set<string>();

describe("the rate ladder", () => {
  it("climbs 10 → 20 across the first six streak days", () => {
    expect(POINT_RATES).toEqual([10, 12, 14, 16, 18, 20]);
    expect(rateForStreak(1)).toBe(10);
    expect(rateForStreak(2)).toBe(12);
    expect(rateForStreak(3)).toBe(14);
    expect(rateForStreak(4)).toBe(16);
    expect(rateForStreak(5)).toBe(18);
    expect(rateForStreak(6)).toBe(20);
  });

  it("caps at 20% however long the streak runs", () => {
    expect(MAX_POINT_RATE).toBe(20);
    expect(rateForStreak(7)).toBe(20);
    expect(rateForStreak(20)).toBe(20);
    expect(rateForStreak(365)).toBe(20);
  });

  it("treats a zero or negative streak as the first day", () => {
    expect(rateForStreak(0)).toBe(10);
    expect(rateForStreak(-3)).toBe(10);
  });
});

describe("isExemptDay", () => {
  it("exempts Saturday and Sunday", () => {
    expect(isExemptDay("2026-07-25", NO_HOLIDAYS)).toBe(true); // Saturday
    expect(isExemptDay("2026-07-26", NO_HOLIDAYS)).toBe(true); // Sunday
  });

  it("does not exempt a plain working day", () => {
    expect(isExemptDay("2026-07-22", NO_HOLIDAYS)).toBe(false); // Wednesday
  });

  it("exempts an admin holiday date", () => {
    expect(isExemptDay("2026-07-22", new Set(["2026-07-22"]))).toBe(true);
  });
});

describe("nextStreak", () => {
  it("starts a first-ever order at day 1", () => {
    expect(nextStreak(null, "2026-07-20", NO_HOLIDAYS)).toBe(1);
  });

  it("advances on consecutive working days", () => {
    expect(
      nextStreak({ count: 2, lastDate: "2026-07-20" }, "2026-07-21", NO_HOLIDAYS),
    ).toBe(3);
  });

  it("holds the streak for a second order on the same day", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-21" }, "2026-07-21", NO_HOLIDAYS),
    ).toBe(3);
  });

  it("resets when a working day was missed", () => {
    // Wednesday missed entirely: Tue → Thu.
    expect(
      nextStreak({ count: 5, lastDate: "2026-07-21" }, "2026-07-23", NO_HOLIDAYS),
    ).toBe(1);
  });

  it("survives the weekend: Friday → Monday advances", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-27", NO_HOLIDAYS),
    ).toBe(4);
  });

  it("breaks when Monday is also missed: Friday → Tuesday resets", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-28", NO_HOLIDAYS),
    ).toBe(1);
  });

  it("counts a weekend order: Friday → Saturday advances", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-25", NO_HOLIDAYS),
    ).toBe(4);
  });

  it("skips an admin holiday: Tuesday → Thursday advances", () => {
    expect(
      nextStreak(
        { count: 4, lastDate: "2026-07-21" },
        "2026-07-23",
        new Set(["2026-07-22"]),
      ),
    ).toBe(5);
  });

  it("chains a holiday Friday into the weekend", () => {
    // Thu → Mon, with Friday declared a holiday and Sat/Sun exempt.
    expect(
      nextStreak(
        { count: 2, lastDate: "2026-07-23" },
        "2026-07-27",
        new Set(["2026-07-24"]),
      ),
    ).toBe(3);
  });

  it("treats a corrupt or empty stored streak as a fresh start", () => {
    expect(nextStreak({ count: 0, lastDate: "2026-07-20" }, "2026-07-21", NO_HOLIDAYS)).toBe(1);
    expect(nextStreak({ count: 3, lastDate: "" }, "2026-07-21", NO_HOLIDAYS)).toBe(1);
  });

  it("never punishes a lastDate in the future", () => {
    expect(
      nextStreak({ count: 4, lastDate: "2026-07-28" }, "2026-07-27", NO_HOLIDAYS),
    ).toBe(4);
  });
});

describe("computePointsEarned", () => {
  it("takes the rate off the pre-tax base, rounded to a whole point", () => {
    expect(computePointsEarned(450, 14)).toBe(63);
    expect(computePointsEarned(500, 10)).toBe(50);
    expect(computePointsEarned(500, 20)).toBe(100);
  });

  it("rounds a half point up", () => {
    expect(computePointsEarned(105, 10)).toBe(11); // 10.5
  });

  it("earns nothing on a zero or negative base", () => {
    expect(computePointsEarned(0, 20)).toBe(0);
    expect(computePointsEarned(-100, 20)).toBe(0);
  });

  it("earns nothing at a zero rate", () => {
    expect(computePointsEarned(500, 0)).toBe(0);
  });
});

describe("computePointsApplied", () => {
  it("applies the full balance when it fits under the payable minus ₹1", () => {
    expect(computePointsApplied(200, 493)).toEqual({
      pointsApplied: 200,
      amountPayable: 293,
    });
  });

  it("caps so ₹1 always remains payable for Razorpay", () => {
    expect(computePointsApplied(1000, 400)).toEqual({
      pointsApplied: 399,
      amountPayable: 1,
    });
  });

  it("applies nothing once the wallet already took the payable to ₹1", () => {
    expect(computePointsApplied(1000, 1)).toEqual({
      pointsApplied: 0,
      amountPayable: 1,
    });
  });

  it("floors a fractional balance and never goes negative", () => {
    expect(computePointsApplied(50.9, 500)).toEqual({
      pointsApplied: 50,
      amountPayable: 450,
    });
    expect(computePointsApplied(-20, 500)).toEqual({
      pointsApplied: 0,
      amountPayable: 500,
    });
  });

  it("applies nothing on a zero balance", () => {
    expect(computePointsApplied(0, 500)).toEqual({
      pointsApplied: 0,
      amountPayable: 500,
    });
  });
});

describe("sanitizeExemptDates", () => {
  it("keeps only well-formed dates, de-duplicated and sorted", () => {
    expect(
      sanitizeExemptDates([
        "2026-08-15",
        "2026-01-26",
        "2026-08-15",
        "15-08-2026",
        "not a date",
        42,
        null,
      ]),
    ).toEqual(["2026-01-26", "2026-08-15"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(sanitizeExemptDates(undefined)).toEqual([]);
    expect(sanitizeExemptDates("2026-08-15")).toEqual([]);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeExemptDates([" 2026-08-15 "])).toEqual(["2026-08-15"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/rewards.test.ts`
Expected: FAIL — `Failed to resolve import "./rewards"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rewards.ts`:

```ts
/**
 * Reward-point and streak math — pure and client-safe (no DB import), so the
 * cart can preview exactly what the server later awards. The DB-touching
 * operations live in rewardPoints.ts (server only).
 *
 * Following the ist.ts convention, nothing here reads the clock: callers inject
 * `today` as an IST calendar date (yyyy-mm-dd).
 */

import { addIstDays, istDaysBetween, istWeekday } from "./ist";
import { MIN_PAYABLE } from "./walletMath";

/** Earn rate (%) by streak day: day 1 → 10%, day 6 and beyond → the cap. */
export const POINT_RATES = [10, 12, 14, 16, 18, 20];

/** The ceiling on the earn rate, however long the streak runs. */
export const MAX_POINT_RATE = POINT_RATES[POINT_RATES.length - 1];

/** A customer's stored streak: how many consecutive days, and the last one. */
export interface StreakState {
  count: number;
  /** IST calendar date (yyyy-mm-dd) of the last streak-advancing paid order. */
  lastDate: string;
}

/** The earn rate for a given streak day. Clamped to the ladder at both ends. */
export function rateForStreak(streak: number): number {
  if (!(streak > 0)) return POINT_RATES[0];
  const index = Math.min(Math.floor(streak), POINT_RATES.length) - 1;
  return POINT_RATES[index];
}

/**
 * Days that never break a streak: weekends, plus any date an admin has marked
 * as a holiday (kitchen closed, festival). Skipping one is not a missed day.
 */
export function isExemptDay(date: string, exemptDates: Set<string>): boolean {
  const weekday = istWeekday(date);
  return weekday === "Saturday" || weekday === "Sunday" || exemptDates.has(date);
}

/**
 * The streak value an order placed on `today` produces.
 *
 * - no usable previous streak → 1 (a fresh start)
 * - already ordered today     → unchanged (a 2nd order can't advance it)
 * - every intervening day exempt → +1
 * - a working day was missed  → 1
 */
export function nextStreak(
  prev: StreakState | null,
  today: string,
  exemptDates: Set<string>,
): number {
  if (!prev || !prev.lastDate || !(prev.count > 0)) return 1;

  const gap = istDaysBetween(prev.lastDate, today);
  // Same day, or a lastDate somehow ahead of today (clock skew): hold, never punish.
  if (gap <= 0) return prev.count;

  for (let offset = 1; offset < gap; offset++) {
    if (!isExemptDay(addIstDays(prev.lastDate, offset), exemptDates)) return 1;
  }
  return prev.count + 1;
}

/** Points earned for a pre-tax base at a given rate, rounded to a whole point. */
export function computePointsEarned(rewardBase: number, rate: number): number {
  if (!(rewardBase > 0) || !(rate > 0)) return 0;
  return Math.round((rewardBase * rate) / 100);
}

/**
 * How many points to spend on an order, given the payable that REMAINS after
 * wallet credit has already been applied. Capped so at least MIN_PAYABLE is
 * still charged — Razorpay cannot charge ₹0, and wallet + points share that
 * single floor. Never negative, never more than the balance.
 */
export function computePointsApplied(
  balance: number,
  payableAfterWallet: number,
): { pointsApplied: number; amountPayable: number } {
  const spendable = Math.max(0, Math.floor(payableAfterWallet) - MIN_PAYABLE);
  const pointsApplied = Math.max(
    0,
    Math.min(Math.floor(Math.max(0, balance)), spendable),
  );
  return { pointsApplied, amountPayable: payableAfterWallet - pointsApplied };
}

/**
 * Normalise the admin-entered holiday list: well-formed yyyy-mm-dd only,
 * de-duplicated and sorted. Anything unparseable is dropped rather than
 * rejected, so one bad row can never wedge the settings document.
 */
export function sanitizeExemptDates(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const dates = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) dates.add(trimmed);
  }
  return [...dates].sort();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/rewards.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full suite and lint**

Run: `npx vitest run && npm run lint`
Expected: the whole suite passes and lint is clean. Nothing else imports `rewards.ts` yet, so no other test can be affected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rewards.ts src/lib/rewards.test.ts
git commit -m "$(cat <<'EOF'
feat: reward point ladder and streak math

Pure, client-safe rules for the 10→20% earn ladder and the daily streak.
Weekends and admin holidays are exempt gaps: skipping one holds the streak,
ordering on one still advances it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Types and the reward-points DB layer

The server-only counterpart to Task 1, mirroring `src/lib/wallet.ts` operation for operation. No unit tests here — matching the existing `wallet.ts` convention, whose guarantees are guarded-update-shaped rather than logic-shaped.

**Files:**
- Modify: `src/lib/types.ts` (add fields to `User` and `Order`; add `RewardTransaction`)
- Create: `src/lib/rewardPoints.ts`

**Interfaces:**
- Consumes: `nextStreak`, `rateForStreak`, `computePointsEarned`, `sanitizeExemptDates` from Task 1; `istToday` from `src/lib/ist.ts`.
- Produces:
  - `STREAK_EXEMPT_DATES_KEY = "streakExemptDates"`
  - `getRewardPointsBalance(db: Db, userId: ObjectId): Promise<number>`
  - `getStreakExemptDates(db: Db): Promise<Set<string>>`
  - `getRewardSummary(db: Db, userId: ObjectId, now: Date): Promise<{ points: number; streak: number; nextStreak: number; nextRate: number }>`
  - `reserveRewardPoints(db, userId: ObjectId, orderId: ObjectId, amount: number): Promise<boolean>`
  - `settleRewardPoints(db, userId: ObjectId, orderId: ObjectId, amount: number): Promise<void>`
  - `creditRewardPointsRefund(db, userId: ObjectId, orderId: ObjectId, amount: number): Promise<void>`
  - `awardRewardPoints(db, userId: ObjectId, orderId: ObjectId, now: Date): Promise<void>`
  - `reverseRewardPointsForOrder(db, orderId: ObjectId): Promise<number>`

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`, inside the `User` interface, immediately after the `walletBalance` field (currently the last field before `createdAt`):

```ts
  /** Reward-point balance (1 point = ₹1). Missing = 0. */
  rewardPoints?: number;
  /** Current consecutive-day order streak. Missing = 0. */
  streakCount?: number;
  /** IST calendar date (yyyy-mm-dd) of the last streak-advancing paid order. */
  streakLastDate?: string;
```

In the `Order` interface, immediately after the `amountPayable` field:

```ts
  /** Server-computed pre-tax total, frozen at creation; the reward earn base. */
  rewardBase?: number;
  /** Reward points reserved/redeemed against this order; reduces amountPayable. */
  pointsApplied?: number;
  /** Reward points credited when this order was paid. */
  pointsEarned?: number;
  /** The earn rate (%) used for this order. */
  pointsRate?: number;
  /** The streak day this order produced, for the success screen. */
  streakAfter?: number;
```

At the end of the file, after the `WalletTransaction` interface:

```ts
/** Append-only reward-point ledger entry (collection: rewardTransactions). */
export interface RewardTransaction {
  _id?: ObjectId | string;
  userId: ObjectId | string;
  /**
   * earned → credit at payment; reserved/spent/refunded → order redemption;
   * reversed → clawback when a paid order is refunded.
   */
  type: "earned" | "reserved" | "spent" | "refunded" | "reversed";
  /** Always a positive amount in points. */
  amount: number;
  /** The order this entry relates to. */
  orderId?: ObjectId | string;
  /** The earn rate (%) applied, on `earned` entries. */
  rate?: number;
  /** The streak day reached, on `earned` entries. */
  streakAfter?: number;
  createdAt?: Date;
}
```

- [ ] **Step 2: Write the DB layer**

Create `src/lib/rewardPoints.ts`:

```ts
import { Db, ObjectId } from "mongodb";
import { istToday } from "./ist";
import {
  computePointsEarned,
  nextStreak,
  rateForStreak,
  sanitizeExemptDates,
  type StreakState,
} from "./rewards";
import type { RewardTransaction } from "./types";

const USERS = "users";
const ORDERS = "orders";
const LEDGER = "rewardTransactions";
const SETTINGS = "settings";

/** The `settings` document holding admin-declared streak-exempt dates. */
export const STREAK_EXEMPT_DATES_KEY = "streakExemptDates";

function ledgerEntry(
  entry: Omit<RewardTransaction, "createdAt">,
): RewardTransaction {
  return { ...entry, createdAt: new Date() };
}

export async function getRewardPointsBalance(
  db: Db,
  userId: ObjectId,
): Promise<number> {
  const user = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { rewardPoints: 1 } });
  return Number(user?.rewardPoints ?? 0);
}

/** Dates an admin has declared exempt. Weekends are handled in rewards.ts. */
export async function getStreakExemptDates(db: Db): Promise<Set<string>> {
  const doc = await db
    .collection(SETTINGS)
    .findOne({ key: STREAK_EXEMPT_DATES_KEY });
  return new Set(sanitizeExemptDates(doc?.dates));
}

/** The stored streak, or null when there isn't a usable one yet. */
function readStreak(user: {
  streakCount?: unknown;
  streakLastDate?: unknown;
} | null): StreakState | null {
  const count = Number(user?.streakCount ?? 0);
  const lastDate = user?.streakLastDate;
  if (!(count > 0) || typeof lastDate !== "string" || !lastDate) return null;
  return { count, lastDate };
}

/**
 * Everything the cart and the rewards card need: the balance, the streak as it
 * stands, and what an order placed right now would produce. Display only — the
 * award path recomputes all of it at payment time.
 */
export async function getRewardSummary(
  db: Db,
  userId: ObjectId,
  now: Date,
): Promise<{
  points: number;
  streak: number;
  nextStreak: number;
  nextRate: number;
}> {
  const [user, exemptDates] = await Promise.all([
    db
      .collection(USERS)
      .findOne(
        { _id: userId },
        { projection: { rewardPoints: 1, streakCount: 1, streakLastDate: 1 } },
      ),
    getStreakExemptDates(db),
  ]);
  const projected = nextStreak(readStreak(user), istToday(now), exemptDates);
  return {
    points: Number(user?.rewardPoints ?? 0),
    streak: Number(user?.streakCount ?? 0),
    nextStreak: projected,
    nextRate: rateForStreak(projected),
  };
}

/**
 * Atomically hold `amount` points for an order. Guarded on sufficient balance
 * so it can't go negative or double-spend across concurrent checkouts. Returns
 * false (and reserves nothing) if the balance moved underneath.
 */
export async function reserveRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const res = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, rewardPoints: { $gte: amount } },
      { $inc: { rewardPoints: -amount }, $set: { updatedAt: new Date() } },
    );
  if (res.matchedCount === 0) return false;
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "reserved", amount }));
  return true;
}

/** Reserved → spent. The balance was already decremented at reserve time. */
export async function settleRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "spent", amount }));
}

/**
 * Return a reservation to the balance. The caller owns the guarded update that
 * zeroes `order.pointsApplied`, so this is only ever reached once per order.
 */
export async function creditRewardPointsRefund(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { rewardPoints: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "refunded", amount }));
}

/**
 * Credit the points a paid order earned and advance the customer's streak.
 *
 * Called only from the guarded "order just became paid" block in
 * reconcilePayment, so verify and the webhook racing can never double-credit.
 * The `pointsEarned` check is a second belt for a manual re-run.
 *
 * The streak advance is guarded on `streakLastDate !== today` so a second order
 * on the same day earns points at the same rate without advancing the day.
 */
export async function awardRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  now: Date,
): Promise<void> {
  const order = await db
    .collection(ORDERS)
    .findOne(
      { _id: orderId },
      { projection: { rewardBase: 1, pointsEarned: 1 } },
    );
  const rewardBase = Number(order?.rewardBase ?? 0);
  if (!(rewardBase > 0)) return;
  if (Number(order?.pointsEarned ?? 0) > 0) return; // already awarded

  const [user, exemptDates] = await Promise.all([
    db
      .collection(USERS)
      .findOne(
        { _id: userId },
        { projection: { streakCount: 1, streakLastDate: 1 } },
      ),
    getStreakExemptDates(db),
  ]);

  const today = istToday(now);
  const streakAfter = nextStreak(readStreak(user), today, exemptDates);
  const rate = rateForStreak(streakAfter);
  const points = computePointsEarned(rewardBase, rate);

  const advanced = await db.collection(USERS).updateOne(
    { _id: userId, streakLastDate: { $ne: today } },
    {
      $set: {
        streakCount: streakAfter,
        streakLastDate: today,
        updatedAt: new Date(),
      },
      $inc: { rewardPoints: points },
    },
  );
  if (advanced.matchedCount === 0) {
    // The streak was already advanced today (an earlier order, or a concurrent
    // one that won this update) — credit the points but leave the day alone.
    await db
      .collection(USERS)
      .updateOne(
        { _id: userId },
        { $inc: { rewardPoints: points }, $set: { updatedAt: new Date() } },
      );
  }

  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(
      ledgerEntry({
        userId,
        orderId,
        type: "earned",
        amount: points,
        rate,
        streakAfter,
      }),
    );
  await db.collection(ORDERS).updateOne(
    { _id: orderId },
    {
      $set: {
        pointsEarned: points,
        pointsRate: rate,
        streakAfter,
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * Claw back the points a now-refunded order earned. Idempotent: `pointsEarned`
 * is zeroed in the same guarded update that reads it, so a second call is a
 * no-op. Clamped by a balance guard — the customer may already have spent
 * them, and a loyalty balance must never go negative. Returns points reversed.
 */
export async function reverseRewardPointsForOrder(
  db: Db,
  orderId: ObjectId,
): Promise<number> {
  const before = await db
    .collection(ORDERS)
    .findOneAndUpdate(
      { _id: orderId, pointsEarned: { $gt: 0 } },
      { $set: { pointsEarned: 0, updatedAt: new Date() } },
      { returnDocument: "before" },
    );
  const earned = Number(before?.pointsEarned ?? 0);
  const userId = before?.userId as ObjectId | undefined;
  if (earned <= 0 || !userId) return 0;

  const taken = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, rewardPoints: { $gte: earned } },
      { $inc: { rewardPoints: -earned }, $set: { updatedAt: new Date() } },
    );
  // Balance already dipped below what this order earned — the points are spent.
  // Take nothing rather than drive the balance negative.
  const amount = taken.matchedCount === 0 ? 0 : earned;
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "reversed", amount }));
  return amount;
}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Nothing imports `rewardPoints.ts` yet; this step only proves the module and the new types are well-formed.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — the type additions are all optional fields, so no existing test changes behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/rewardPoints.ts
git commit -m "$(cat <<'EOF'
feat: reward point ledger and streak persistence

Server-side balance, reservation, award, and reversal operations, mirroring
wallet.ts. The streak advance is guarded on the IST date so a second order the
same day earns without advancing the day.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Admin-managed streak-exempt dates

Days the kitchen is shut on a weekday must not reset every streak in the system. The editor lives on the Store Hours page, which already answers "when are we open".

**Files:**
- Create: `src/app/api/admin/streak-holidays/route.ts`
- Modify: `src/app/admin/store-hours/page.tsx`

**Interfaces:**
- Consumes: `STREAK_EXEMPT_DATES_KEY` from Task 2; `sanitizeExemptDates` from Task 1.
- Produces: `GET /api/admin/streak-holidays` → `{ success: true, dates: string[] }`; `POST` with body `{ dates: string[] }` → `{ success: true, dates: string[] }`.

Admin routes are authenticated by middleware (the signed admin session cookie), so no per-route auth check is needed — consistent with `src/app/api/admin/store-schedule/route.ts`.

- [ ] **Step 1: Write the API route**

Create `src/app/api/admin/streak-holidays/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sanitizeExemptDates } from "@/lib/rewards";
import { STREAK_EXEMPT_DATES_KEY } from "@/lib/rewardPoints";

export const dynamic = "force-dynamic";

/** Dates that don't break a reward streak, for the admin Store Hours page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: STREAK_EXEMPT_DATES_KEY });
    return NextResponse.json(
      { success: true, dates: sanitizeExemptDates(doc?.dates) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading streak holidays:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read streak holidays" },
      { status: 500 },
    );
  }
}

/** Replace the holiday list. Body: { dates: string[] } of yyyy-mm-dd. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.dates)) {
      return NextResponse.json(
        { success: false, message: "'dates' must be an array" },
        { status: 400 },
      );
    }
    const dates = sanitizeExemptDates(body.dates);

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: STREAK_EXEMPT_DATES_KEY },
      {
        $set: {
          key: STREAK_EXEMPT_DATES_KEY,
          dates,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true, dates });
  } catch (error) {
    console.error("Error updating streak holidays:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update streak holidays" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Add the editor to the Store Hours page**

In `src/app/admin/store-hours/page.tsx`, add to the imports at the top:

```ts
import { Button, DatePicker, Tag, message } from "antd";
```

Add this state alongside the existing `useState` declarations in `StoreHoursPage`:

```ts
  const [holidays, setHolidays] = useState<string[]>([]);
  const [savingHolidays, setSavingHolidays] = useState(false);
```

Add a second `useEffect` immediately after the existing schedule-loading effect:

```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/streak-holidays", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.dates)) {
          setHolidays(data.dates as string[]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```

Add the save helper next to the existing `save` function:

```ts
  const saveHolidays = async (dates: string[]) => {
    setSavingHolidays(true);
    try {
      const res = await fetch("/api/admin/streak-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates }),
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.dates)) {
        setHolidays(data.dates as string[]);
        message.success("Streak holidays saved");
      } else {
        message.error(data?.message ?? "Failed to save holidays");
      }
    } catch {
      message.error("Failed to save holidays");
    }
    setSavingHolidays(false);
  };
```

Then render the new card. Insert it in the JSX immediately after the closing `</div>` of the existing schedule card (the `<div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">` block) and before the closing `)}` of the `loading` ternary:

```tsx
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4 mt-6">
            <div>
              <h2 className="text-[#111] font-semibold">Streak holidays</h2>
              <p className="text-sm text-gray-500 mt-1">
                Dates the kitchen is shut. Customers won&apos;t lose their
                reward streak for not ordering on these days. Saturdays and
                Sundays are always forgiven — you don&apos;t need to list them.
              </p>
            </div>

            <DatePicker
              value={null}
              disabled={savingHolidays}
              placeholder="Add a date"
              onChange={(_, dateString) => {
                const date = Array.isArray(dateString)
                  ? dateString[0]
                  : dateString;
                if (!date || holidays.includes(date)) return;
                void saveHolidays([...holidays, date]);
              }}
            />

            {holidays.length === 0 ? (
              <p className="text-sm text-gray-400">No holidays set.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {holidays.map((date) => (
                  <Tag
                    key={date}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      void saveHolidays(holidays.filter((d) => d !== date));
                    }}
                  >
                    {date}
                  </Tag>
                ))}
              </div>
            )}

            {savingHolidays && (
              <Button type="text" loading size="small">
                Saving…
              </Button>
            )}
          </div>
```

`DatePicker`'s `onChange` gives the formatted string as its second argument, so no `dayjs` import is needed. Holding `value={null}` clears the picker after each add.

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify by hand in the admin UI**

Run: `npm run dev`, then open `http://localhost:3000/admin/store-hours`.
Expected: a "Streak holidays" card below the hours card. Adding a date shows it as a removable tag and a "Streak holidays saved" toast; reloading the page shows the date still there; the ✕ on the tag removes it.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/streak-holidays/route.ts src/app/admin/store-hours/page.tsx
git commit -m "$(cat <<'EOF'
feat: admin-managed streak holiday dates

Weekday closures shouldn't reset every customer's streak. Admin declares the
dates on the Store Hours page; the streak calculation skips them exactly like
weekends.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Freeze the earn base on new orders

The earn base cannot come from the client. `src/app/api/orders/route.ts` already computes `minAcceptable` — the server's floor for the pre-tax total, recomputed from the DB across every discount the order qualifies for. That is exactly the figure to earn on, so it is stamped onto the order at creation. No behaviour changes yet.

**Files:**
- Modify: `src/app/api/orders/route.ts` (the `orderDoc` literal, around line 323–381)

**Interfaces:**
- Consumes: the local `minAcceptable` const (line ~305) and the `Order.rewardBase` field from Task 2.
- Produces: every newly created order carries `rewardBase`, which Task 5 reads.

- [ ] **Step 1: Stamp `rewardBase` onto the order document**

In `src/app/api/orders/route.ts`, find this run of fields in the `orderDoc` literal:

```ts
      totalAmount,
      discountAmount,
      tax,
      netAmount: totalAmount,
```

Replace it with:

```ts
      totalAmount,
      discountAmount,
      tax,
      // The pre-tax total after every discount, computed entirely server-side
      // (see minAcceptable above) — the base reward points are earned on. It is
      // conservative by construction: it assumes the largest discount the
      // customer was entitled to, so a tampered client can never inflate it.
      rewardBase: minAcceptable,
      netAmount: totalAmount,
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — this adds a stored field and changes no computation.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/orders/route.ts
git commit -m "$(cat <<'EOF'
feat: freeze the server-computed pre-tax total on each order

Stamps rewardBase from the existing anti-tampering floor, so reward points are
later earned on a figure the client never supplied.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Award points when an order is paid

`reconcilePayment` has one block guarded on the "not already paid" transition, so exactly one caller — the client `verify-order` or the Razorpay webhook, whichever wins the race — runs the paid-once side effects. Points join it.

**Files:**
- Modify: `src/lib/reconcilePayment.ts` (imports, and the `didTransition` block at lines ~316–338)

**Interfaces:**
- Consumes: `awardRewardPoints` from Task 2; `order.rewardBase` from Task 4.
- Produces: paid orders carry `pointsEarned`, `pointsRate`, `streakAfter`; the user's `rewardPoints`, `streakCount`, `streakLastDate` advance.

- [ ] **Step 1: Import the award operation**

In `src/lib/reconcilePayment.ts`, change:

```ts
import { settleWallet, creditReferral } from "@/lib/wallet";
```

to:

```ts
import { settleWallet, creditReferral } from "@/lib/wallet";
import { awardRewardPoints } from "@/lib/rewardPoints";
```

- [ ] **Step 2: Award inside the paid-once block**

In the same file, find:

```ts
      if (walletApplied > 0) {
        await settleWallet(db, userId, _id, walletApplied);
      }
      await creditReferral(db, userId);
    }
```

Replace it with:

```ts
      if (walletApplied > 0) {
        await settleWallet(db, userId, _id, walletApplied);
      }
      await creditReferral(db, userId);
      // Reward points for this order + the streak advance. Inside the
      // didTransition guard, so a verify/webhook race can't double-credit.
      await awardRewardPoints(db, userId, _id, new Date());
    }
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verify by hand end to end**

Run `npm run dev`, place a test order through `/order`, and pay with Razorpay test credentials.
Expected: in MongoDB, the order gains `pointsEarned` (10% of its `rewardBase`, rounded), `pointsRate: 10`, `streakAfter: 1`; the user gains `rewardPoints`, `streakCount: 1`, and today's `streakLastDate`; a `rewardTransactions` row of type `earned` exists. Placing a second order the same day leaves `streakCount` at 1 and earns at 10% again.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reconcilePayment.ts
git commit -m "$(cat <<'EOF'
feat: award reward points and advance the streak on payment

Hooks into the single guarded paid-once block, so a verify/webhook race or a
Razorpay retry can never double-credit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewards read endpoint

Checkout and the order-history card need the balance and the projected rate before payment. Mirrors `src/app/api/wallet/balance/route.ts`, including its signed-out fallback.

**Files:**
- Create: `src/app/api/rewards/me/route.ts`

**Interfaces:**
- Consumes: `getRewardSummary` from Task 2; `getCustomerUserId` from `src/lib/customerSession.ts`.
- Produces: `GET /api/rewards/me` → `{ success: boolean, points: number, streak: number, nextStreak: number, nextRate: number }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/rewards/me/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId } from "@/lib/customerSession";
import { getRewardSummary } from "@/lib/rewardPoints";
import { POINT_RATES } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/** What a signed-out visitor (or an error) sees: nothing banked, day-1 rate. */
const EMPTY = {
  points: 0,
  streak: 0,
  nextStreak: 1,
  nextRate: POINT_RATES[0],
};

/**
 * The signed-in customer's reward balance and streak, plus what an order placed
 * right now would earn. Preview only — awardRewardPoints recomputes all of this
 * server-side when the payment settles.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: true, ...EMPTY },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { db } = await connectToDatabase();
    const summary = await getRewardSummary(db, userId, new Date());
    return NextResponse.json(
      { success: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading reward summary:", error);
    return NextResponse.json(
      { success: false, ...EMPTY },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify by hand**

Run `npm run dev`, sign in as a customer, then in the browser console on any page of the site:

```js
await (await fetch("/api/rewards/me", { cache: "no-store" })).json()
```

Expected: `{ success: true, points: <n>, streak: <n>, nextStreak: <n>, nextRate: 10|12|14|16|18|20 }`. Signed out, it returns the zeroed shape with `nextRate: 10`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/rewards/me/route.ts
git commit -m "$(cat <<'EOF'
feat: rewards summary endpoint for the cart preview

Returns the balance, current streak, and the rate an order placed right now
would earn. Display only; the award path stays authoritative.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Redeem points at checkout, and unify the unwind

Two changes that must land together. Points are reserved at order creation exactly as wallet credit is; and because an abandoned or failed order must return *both* balances in one guarded update, the wallet's unwind helpers are generalised into a single order-redemption module.

**Files:**
- Create: `src/lib/orderRedemption.ts`
- Modify: `src/lib/wallet.ts` (replace `refundReservationForOrder` and `sweepStaleOrderReservations` with `creditWalletRefund`)
- Modify: `src/app/api/orders/route.ts` (imports; the wallet block at ~395–430)
- Modify: `src/app/api/payment/fail-order/route.ts` (line 6 import, line 33 call)
- Modify: `src/lib/reconcilePayment.ts` (settle the points reservation)

**Interfaces:**
- Consumes: `computePointsApplied` (Task 1); `getRewardPointsBalance`, `reserveRewardPoints`, `settleRewardPoints`, `creditRewardPointsRefund` (Task 2).
- Produces:
  - `creditWalletRefund(db: Db, userId: ObjectId, orderId: ObjectId, amount: number): Promise<void>` in `wallet.ts`
  - `refundOrderRedemptions(db: Db, orderId: ObjectId): Promise<{ wallet: number; points: number }>` in `orderRedemption.ts`
  - `sweepStaleOrderRedemptions(db: Db, userId: ObjectId, olderThanMs: number): Promise<void>` in `orderRedemption.ts`
  - orders accept `useRewardPoints?: boolean` in the create-order body (request-only, defaults to on)

- [ ] **Step 1: Replace the wallet's unwind helpers with a credit-back helper**

In `src/lib/wallet.ts`, delete both `refundReservationForOrder` (lines 63–104) and `sweepStaleOrderReservations` (lines 106–128) entirely, and put this in their place:

```ts
/**
 * Return a reservation to the wallet. The caller owns the guarded update that
 * zeroes `order.walletApplied`, so this is only ever reached once per order —
 * see refundOrderRedemptions in orderRedemption.ts, which unwinds wallet credit
 * and reward points together in a single atomic update.
 */
export async function creditWalletRefund(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { walletBalance: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection<WalletTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "refunded", amount }));
}
```

The `ORDERS` constant at the top of `wallet.ts` is now unused — delete the line `const ORDERS = "orders";` so lint stays clean.

- [ ] **Step 2: Write the unified unwind module**

Create `src/lib/orderRedemption.ts`:

```ts
import { Db, ObjectId } from "mongodb";
import { creditWalletRefund } from "./wallet";
import { creditRewardPointsRefund } from "./rewardPoints";

const ORDERS = "orders";

/**
 * Return an unpaid order's redemptions — wallet credit AND reward points — to
 * the customer's balances.
 *
 * The two are zeroed in ONE guarded update alongside the restored
 * `netAmount`/`amountPayable`, which is what makes this idempotent: a second
 * call finds nothing to unwind and does nothing. Splitting it per balance
 * would open a window where a retry refunds one of them twice.
 */
export async function refundOrderRedemptions(
  db: Db,
  orderId: ObjectId,
): Promise<{ wallet: number; points: number }> {
  const before = await db.collection(ORDERS).findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: { $ne: "paid" },
      $or: [{ walletApplied: { $gt: 0 } }, { pointsApplied: { $gt: 0 } }],
    },
    [
      {
        $set: {
          walletApplied: 0,
          pointsApplied: 0,
          amountPayable: "$totalAmount",
          netAmount: "$totalAmount",
          updatedAt: new Date(),
        },
      },
    ],
    { returnDocument: "before" },
  );

  const wallet = Number(before?.walletApplied ?? 0);
  const points = Number(before?.pointsApplied ?? 0);
  const userId = before?.userId as ObjectId | undefined;
  if (!userId) return { wallet: 0, points: 0 };

  if (wallet > 0) await creditWalletRefund(db, userId, orderId, wallet);
  if (points > 0) await creditRewardPointsRefund(db, userId, orderId, points);
  return { wallet, points };
}

/** Safety net for checkouts abandoned before the client fail-call fired. */
export async function sweepStaleOrderRedemptions(
  db: Db,
  userId: ObjectId,
  olderThanMs: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .collection(ORDERS)
    .find(
      {
        userId,
        paymentStatus: { $ne: "paid" },
        createdAt: { $lt: cutoff },
        $or: [{ walletApplied: { $gt: 0 } }, { pointsApplied: { $gt: 0 } }],
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const order of stale) {
    await refundOrderRedemptions(db, order._id as ObjectId);
  }
}
```

- [ ] **Step 3: Point the fail-order route at the new helper**

In `src/app/api/payment/fail-order/route.ts`, change line 6:

```ts
import { refundReservationForOrder } from "@/lib/wallet";
```

to:

```ts
import { refundOrderRedemptions } from "@/lib/orderRedemption";
```

and line 33:

```ts
    await refundReservationForOrder(db, new ObjectId(orderId));
```

to:

```ts
    await refundOrderRedemptions(db, new ObjectId(orderId));
```

- [ ] **Step 4: Reserve points at order creation**

In `src/app/api/orders/route.ts`, change the wallet import block:

```ts
import {
  getWalletBalance,
  reserveWallet,
  sweepStaleOrderReservations,
} from "@/lib/wallet";
import { computeWalletApplied } from "@/lib/walletMath";
```

to:

```ts
import { getWalletBalance, reserveWallet } from "@/lib/wallet";
import { sweepStaleOrderRedemptions } from "@/lib/orderRedemption";
import { computeWalletApplied } from "@/lib/walletMath";
import { computePointsApplied } from "@/lib/rewards";
import {
  getRewardPointsBalance,
  reserveRewardPoints,
} from "@/lib/rewardPoints";
```

Then replace the whole wallet block — from the `const wantWallet =` line through the closing brace of `if (wantWallet) { … }` (lines ~388–430) — with this:

```ts
    // Redemption — wallet credit first, then reward points on whatever payable
    // remains. Both are auto-applied unless the client opted out, and both are
    // reserved at creation so a balance can't be double-spent across concurrent
    // checkouts; the reservations settle at payment (reconcile) or are refunded
    // on fail/sweep. Only for online orders — COD never reaches the settle path.
    const online = orderDoc.paymentMethod !== "cash";
    const wantWallet =
      (body as { useWallet?: boolean }).useWallet !== false && online;
    const wantPoints =
      (body as { useRewardPoints?: boolean }).useRewardPoints !== false &&
      online;

    // Reclaim any reservations from this user's abandoned checkouts first —
    // this must run even at a zero live balance, since a balance can read 0
    // precisely because it's all tied up in a stale reservation.
    if (wantWallet || wantPoints) {
      await sweepStaleOrderRedemptions(db, orderUserId, 30 * 60 * 1000);
    }

    // Tracks the payable as each balance is applied, so the MIN_PAYABLE floor
    // is enforced once across both rather than twice.
    let payableSoFar = totalAmount;

    if (wantWallet) {
      const balance = await getWalletBalance(db, orderUserId);
      const { walletApplied, amountPayable } = computeWalletApplied(
        balance,
        payableSoFar,
      );
      if (walletApplied > 0) {
        const reserved = await reserveWallet(
          db,
          orderUserId,
          result.insertedId,
          walletApplied,
        );
        if (reserved) {
          payableSoFar = amountPayable;
          // netAmount is what Razorpay is charged and what reconcile verifies.
          await db.collection("orders").updateOne(
            { _id: result.insertedId },
            {
              $set: {
                walletApplied,
                amountPayable,
                netAmount: amountPayable,
                updatedAt: new Date(),
              },
            },
          );
        }
      }
    }

    if (wantPoints) {
      const balance = await getRewardPointsBalance(db, orderUserId);
      const { pointsApplied, amountPayable } = computePointsApplied(
        balance,
        payableSoFar,
      );
      if (pointsApplied > 0) {
        const reserved = await reserveRewardPoints(
          db,
          orderUserId,
          result.insertedId,
          pointsApplied,
        );
        if (reserved) {
          payableSoFar = amountPayable;
          await db.collection("orders").updateOne(
            { _id: result.insertedId },
            {
              $set: {
                pointsApplied,
                amountPayable,
                netAmount: amountPayable,
                updatedAt: new Date(),
              },
            },
          );
        }
      }
    }

    if (wantWallet || wantPoints) {
      order = await db.collection("orders").findOne({ _id: result.insertedId });
    }
```

- [ ] **Step 5: Settle the points reservation at payment**

In `src/lib/reconcilePayment.ts`, change the import added in Task 5:

```ts
import { awardRewardPoints } from "@/lib/rewardPoints";
```

to:

```ts
import { awardRewardPoints, settleRewardPoints } from "@/lib/rewardPoints";
```

Then find, in the `didTransition` block:

```ts
    const userId = order.userId as ObjectId | undefined;
    const walletApplied = Number(order.walletApplied ?? 0);
    if (userId) {
```

and change it to:

```ts
    const userId = order.userId as ObjectId | undefined;
    const walletApplied = Number(order.walletApplied ?? 0);
    const pointsApplied = Number(order.pointsApplied ?? 0);
    if (userId) {
```

Then, directly after the existing `settleWallet` call:

```ts
      if (walletApplied > 0) {
        await settleWallet(db, userId, _id, walletApplied);
      }
```

add:

```ts
      if (pointsApplied > 0) {
        await settleRewardPoints(db, userId, _id, pointsApplied);
      }
```

- [ ] **Step 6: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. In particular, no file still references `refundReservationForOrder` or `sweepStaleOrderReservations`. Confirm with:

Run: `grep -rn "refundReservationForOrder\|sweepStaleOrderReservations" src/`
Expected: no output.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Verify by hand end to end**

Run `npm run dev` with a customer who has a non-zero `rewardPoints` balance (set it directly in MongoDB if needed) and place an order.
Expected: the created order has `pointsApplied > 0` and `netAmount = totalAmount − walletApplied − pointsApplied`; Razorpay is asked for exactly that `netAmount`; the user's `rewardPoints` dropped by `pointsApplied` and a `reserved` ledger row exists. After paying, a `spent` row appears. Repeat, but dismiss the Razorpay sheet instead of paying: the points return to the balance and a `refunded` row appears.

- [ ] **Step 9: Commit**

```bash
git add src/lib/orderRedemption.ts src/lib/wallet.ts src/app/api/orders/route.ts src/app/api/payment/fail-order/route.ts src/lib/reconcilePayment.ts
git commit -m "$(cat <<'EOF'
feat: redeem reward points at checkout

Points are reserved at order creation like wallet credit, guarded on balance so
concurrent checkouts can't double-spend. Wallet applies first, then points on
the remaining payable, sharing one MIN_PAYABLE floor.

Unwinding both balances now happens in a single guarded update
(refundOrderRedemptions), replacing the wallet-only helpers — splitting it per
balance would let a retry refund one of them twice.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reverse points when an admin refunds an order

Rejecting a paid order issues a real Razorpay refund. The points that order earned must come back off the balance, and any points it spent must be returned.

**Files:**
- Modify: `src/app/api/admin/orders/route.ts` (the `reject` block, lines ~218–275)

**Interfaces:**
- Consumes: `reverseRewardPointsForOrder`, `creditRewardPointsRefund` from Task 2; `creditWalletRefund` from Task 7.
- Produces: refunded orders carry `pointsEarned: 0`; a `reversed` ledger row records the clawback.

Note the streak is deliberately left alone: the order was genuinely placed, and rejections are usually the kitchen's call.

- [ ] **Step 1: Import the reversal operations**

In `src/app/api/admin/orders/route.ts`, add to the imports at the top of the file:

```ts
import {
  reverseRewardPointsForOrder,
  creditRewardPointsRefund,
} from "@/lib/rewardPoints";
import { creditWalletRefund } from "@/lib/wallet";
```

- [ ] **Step 2: Unwind the order's rewards after the refund succeeds**

In the same file, find the end of the reject block:

```ts
      await db
        .collection("orders")
        .updateOne({ _id }, { $set: rejectUpdate });

      return NextResponse.json({
        success: true,
        status: "cancelled",
        paymentStatus: rejectUpdate.paymentStatus ?? order.paymentStatus,
        refunded,
      });
```

Replace it with:

```ts
      await db
        .collection("orders")
        .updateOne({ _id }, { $set: rejectUpdate });

      // Unwind the order's rewards. Only after the Razorpay refund succeeded —
      // a failed refund returns above and leaves the order untouched.
      const orderUserId = order.userId as ObjectId | undefined;
      if (refunded && orderUserId) {
        // Give back what the customer spent on this order…
        const walletSpent = Number(order.walletApplied ?? 0);
        const pointsSpent = Number(order.pointsApplied ?? 0);
        if (walletSpent > 0) {
          await creditWalletRefund(db, orderUserId, _id, walletSpent);
        }
        if (pointsSpent > 0) {
          await creditRewardPointsRefund(db, orderUserId, _id, pointsSpent);
        }
        await db.collection("orders").updateOne(
          { _id },
          { $set: { walletApplied: 0, pointsApplied: 0, updatedAt: new Date() } },
        );
        // …and claw back what it earned. The streak day stands: the order was
        // genuinely placed, and a rejection is usually the kitchen's call.
        await reverseRewardPointsForOrder(db, _id);
      }

      return NextResponse.json({
        success: true,
        status: "cancelled",
        paymentStatus: rejectUpdate.paymentStatus ?? order.paymentStatus,
        refunded,
      });
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `ObjectId` is not already imported in this file, add it — check with `grep -n "^import.*mongodb" src/app/api/admin/orders/route.ts` (it is imported today for `new ObjectId(id)`).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verify by hand**

Run `npm run dev`, place and pay for an order that both earns and redeems points, then reject it from `/admin/orders`.
Expected: the order shows `paymentStatus: "refunded"`, `pointsEarned: 0`, `pointsApplied: 0`; the customer's `rewardPoints` is back to (balance before the order) — the redeemed points returned and the earned points clawed back; `rewardTransactions` has both a `refunded` and a `reversed` row; `streakCount` and `streakLastDate` are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/orders/route.ts
git commit -m "$(cat <<'EOF'
feat: unwind reward points when an order is refunded

Returns what the order spent and claws back what it earned, clamped so a
balance can never go negative. The streak day stands — the order was real.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Show the streak and the points toggle at checkout

The streak line is both the reward and the nudge: a customer on day 3 can see tomorrow is worth 16%, and that skipping a working day drops them to 10%.

**Files:**
- Modify: `src/app/order/page.tsx`

**Interfaces:**
- Consumes: `GET /api/rewards/me` (Task 6); `computePointsApplied`, `computePointsEarned` from Task 1.
- Produces: the create-order request body carries `useRewardPoints`, read by Task 7.

- [ ] **Step 1: Import the math helpers**

In `src/app/order/page.tsx`, after the existing `import { computeWalletApplied } from "@/lib/walletMath";` (line 40), add:

```ts
import { computePointsApplied, computePointsEarned } from "@/lib/rewards";
```

- [ ] **Step 2: Add the reward state**

After the existing `const [useWallet, setUseWallet] = useState(true);` (line 101), add:

```ts
  const [rewardPoints, setRewardPoints] = useState(0);
  const [rewardNextStreak, setRewardNextStreak] = useState(1);
  const [rewardNextRate, setRewardNextRate] = useState(10);
  const [useRewardPoints, setUseRewardPoints] = useState(true);
```

- [ ] **Step 3: Fetch the reward summary alongside the wallet balance**

In the effect that loads first-order eligibility and the wallet balance (lines ~147–176), replace its body with:

```ts
    if (!isAuthenticated) {
      setFirstOrderEligible(false);
      setWalletBalance(0);
      setRewardPoints(0);
      setRewardNextStreak(1);
      setRewardNextRate(10);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [eligRes, walletRes, rewardsRes] = await Promise.all([
          fetch("/api/orders/first-order-eligibility", { cache: "no-store" }),
          fetch("/api/wallet/balance", { cache: "no-store" }),
          fetch("/api/rewards/me", { cache: "no-store" }),
        ]);
        const elig = await eligRes.json();
        const wallet = await walletRes.json();
        const rewards = await rewardsRes.json();
        if (!cancelled) {
          setFirstOrderEligible(!!elig?.eligible);
          setWalletBalance(Number(wallet?.balance ?? 0));
          setRewardPoints(Number(rewards?.points ?? 0));
          setRewardNextStreak(Number(rewards?.nextStreak ?? 1));
          setRewardNextRate(Number(rewards?.nextRate ?? 10));
        }
      } catch {
        if (!cancelled) {
          setFirstOrderEligible(false);
          setWalletBalance(0);
          setRewardPoints(0);
          setRewardNextStreak(1);
          setRewardNextRate(10);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
```

- [ ] **Step 4: Compute the preview**

Find the wallet preview at the end of the render-scope computations (lines ~503–508):

```ts
  // Wallet credit preview — reserved authoritatively server-side at creation.
  const walletApplied =
    useWallet && walletBalance > 0
      ? computeWalletApplied(walletBalance, finalPrice).walletApplied
      : 0;
  const payable = finalPrice - walletApplied;
```

Replace it with:

```ts
  // Wallet credit preview — reserved authoritatively server-side at creation.
  const walletApplied =
    useWallet && walletBalance > 0
      ? computeWalletApplied(walletBalance, finalPrice).walletApplied
      : 0;
  // Reward points apply to what's left after wallet credit, matching the order
  // route. Preview only — reserved authoritatively server-side at creation.
  const pointsApplied =
    useRewardPoints && rewardPoints > 0
      ? computePointsApplied(rewardPoints, finalPrice - walletApplied)
          .pointsApplied
      : 0;
  const payable = finalPrice - walletApplied - pointsApplied;
  // Points this order will earn: the streak rate off the pre-tax total.
  // Redeeming doesn't shrink the base — points are consideration, not a discount.
  const pointsWillEarn = computePointsEarned(discountedSubtotal, rewardNextRate);
```

- [ ] **Step 5: Send the opt-out flag**

In `placeOrder`, find:

```ts
        // `useWallet` is a request-only flag (not part of the stored order).
        body: JSON.stringify({ ...orderPayload, useWallet }),
```

Replace it with:

```ts
        // `useWallet`/`useRewardPoints` are request-only flags (not part of the
        // stored order).
        body: JSON.stringify({ ...orderPayload, useWallet, useRewardPoints }),
```

- [ ] **Step 6: Render the streak line and the points toggle**

In the price-breakdown block, find the wallet row (lines ~819–836). Insert the streak banner *before* it and the points row *after* it — the rows must read in the order the balances are actually applied (wallet first, then points), or the bill won't explain its own arithmetic. The block becomes:

```tsx
                {isAuthenticated && pointsWillEarn > 0 ? (
                  <div className="rounded-lg bg-[#fff4ec] px-3 py-2">
                    <div className="text-sm font-semibold text-[#f56215]">
                      🔥 Day {rewardNextStreak} streak · earning{" "}
                      {rewardNextRate}%
                    </div>
                    <div className="text-xs text-[#8a6b57] mt-0.5">
                      You&apos;ll earn {pointsWillEarn} points on this order
                      {rewardNextRate < 20
                        ? " — order tomorrow to earn more"
                        : " — you're at the maximum rate"}
                    </div>
                  </div>
                ) : null}
                {walletBalance > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-[#666]">
                      <input
                        type="checkbox"
                        checked={useWallet}
                        onChange={(e) => setUseWallet(e.target.checked)}
                        className="h-4 w-4 accent-[#f56215]"
                      />
                      Use wallet credit (₹{walletBalance})
                    </label>
                    {walletApplied > 0 ? (
                      <span className="text-[#00a86e]">−₹{walletApplied}</span>
                    ) : (
                      <span className="text-[#bbb] text-[13px]">₹0</span>
                    )}
                  </div>
                ) : null}
                {rewardPoints > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-[#666]">
                      <input
                        type="checkbox"
                        checked={useRewardPoints}
                        onChange={(e) => setUseRewardPoints(e.target.checked)}
                        className="h-4 w-4 accent-[#f56215]"
                      />
                      Use reward points ({rewardPoints})
                    </label>
                    {pointsApplied > 0 ? (
                      <span className="text-[#00a86e]">−₹{pointsApplied}</span>
                    ) : (
                      <span className="text-[#bbb] text-[13px]">₹0</span>
                    )}
                  </div>
                ) : null}
```

- [ ] **Step 7: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Verify by hand**

Run `npm run dev`, sign in, and open `/order` with items in the cart.
Expected: the breakdown shows "🔥 Day N streak · earning R%" with the points the order will earn; a customer with a balance sees the "Use reward points" checkbox and the discount line; unticking it raises the Pay-now amount by exactly that much; the amount Razorpay asks for matches the Pay-now figure.

- [ ] **Step 9: Commit**

```bash
git add src/app/order/page.tsx
git commit -m "$(cat <<'EOF'
feat: show the reward streak and points redemption at checkout

Surfaces the current rate and what the order will earn, plus a redemption
toggle beside the wallet's. Preview only; the server reserves and awards.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Confirm the reward on the success screen and bank it on order history

The success screen is where the mechanic teaches itself; the order-history page is where the balance lives between orders.

**Files:**
- Modify: `src/app/success/page.tsx`
- Modify: `src/app/orders/page.tsx`

**Interfaces:**
- Consumes: `order.pointsEarned` / `order.pointsRate` / `order.streakAfter` (stamped by Task 5); `GET /api/rewards/me` (Task 6); `POINT_RATES` from Task 1.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the reward banner to the success screen**

`src/app/success/page.tsx` already fetches the order into `order` state and polls it. Find the JSX where the order confirmation is rendered — immediately after the block containing `CheckCircleIcon` — and insert:

```tsx
      {order?.pointsEarned ? (
        <div className="mx-4 mb-4 rounded-xl bg-[#fff4ec] px-4 py-3">
          <div className="text-base font-semibold text-[#f56215]">
            🔥 Day {order.streakAfter} streak
          </div>
          <div className="text-sm text-[#8a6b57] mt-1">
            You earned {order.pointsEarned} reward points at {order.pointsRate}%
            {order.pointsRate && order.pointsRate < 20
              ? " — order again tomorrow to earn even more"
              : " — you're at the maximum rate"}
          </div>
        </div>
      ) : null}
```

`pointsEarned` is stamped when the payment settles, and the page already re-fetches the order, so the banner appears as soon as reconciliation completes.

- [ ] **Step 2: Add the rewards card to order history**

In `src/app/orders/page.tsx`, add to the imports:

```ts
import { POINT_RATES } from "@/lib/rewards";
```

Add state alongside the existing declarations in `MyOrdersPage`:

```ts
  const [rewards, setRewards] = useState<{
    points: number;
    streak: number;
    nextRate: number;
  } | null>(null);
```

Add an effect after the existing menu-loading effect:

```ts
  useEffect(() => {
    if (!isAuthenticated) {
      setRewards(null);
      return;
    }
    let cancelled = false;
    fetch("/api/rewards/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setRewards({
          points: Number(data.points ?? 0),
          streak: Number(data.streak ?? 0),
          nextRate: Number(data.nextRate ?? 10),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
```

Render the card at the top of the orders list, immediately after the page header:

```tsx
      {rewards ? (
        <div className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-[#f56215]">
                {rewards.points}
              </div>
              <div className="text-xs text-gray-500">Reward points</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[#111]">
                🔥 {rewards.streak}
              </div>
              <div className="text-xs text-gray-500">Day streak</div>
            </div>
          </div>

          <div className="mt-4 flex gap-1">
            {POINT_RATES.map((rate, index) => {
              const day = index + 1;
              const reached = rewards.streak >= day;
              return (
                <div key={rate} className="flex-1 text-center">
                  <div
                    className={`h-1.5 rounded-full ${
                      reached ? "bg-[#f56215]" : "bg-gray-200"
                    }`}
                  />
                  <div
                    className={`mt-1 text-[10px] ${
                      reached ? "text-[#f56215] font-semibold" : "text-gray-400"
                    }`}
                  >
                    {rate}%
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Order every day to climb to {POINT_RATES[POINT_RATES.length - 1]}%
            back. Weekends off don&apos;t break your streak. Your next order
            earns {rewards.nextRate}%.
          </p>
        </div>
      ) : null}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify by hand**

Run `npm run dev`, complete a paid order, and land on `/success`.
Expected: once reconciliation lands, the streak banner shows the day and points earned. Then open `/orders`: the card shows the balance, the streak, the six-rung ladder with reached rungs in orange, and the next order's rate.

- [ ] **Step 5: Commit**

```bash
git add src/app/success/page.tsx src/app/orders/page.tsx
git commit -m "$(cat <<'EOF'
feat: surface earned points and the streak ladder to customers

Success screen confirms what the order banked; order history carries the
standing balance, streak, and the six-rung ladder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Reward points column in admin users

So support can answer "how many points do I have?" without a database query.

**Files:**
- Modify: `src/app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `users.rewardPoints` and `users.streakCount` (Task 2). `GET /api/admin/users` already returns full user documents, so no API change is needed.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Extend the row type and the mapping**

In `src/app/admin/users/page.tsx`, add to the `UserRow` interface:

```ts
  rewardPoints: number;
  streakCount: number;
```

In `fetchUsers`, add these two fields to the object returned from the `.map(...)`, next to `address`:

```ts
                rewardPoints: Number(u.rewardPoints ?? 0),
                streakCount: Number(u.streakCount ?? 0),
```

- [ ] **Step 2: Add the columns**

In the `columns` array, insert these two entries between the `Address` and `Created` columns:

```ts
    {
      title: "Points",
      dataIndex: "rewardPoints",
      key: "rewardPoints",
      width: 90,
      sorter: (a: UserRow, b: UserRow) => a.rewardPoints - b.rewardPoints,
    },
    {
      title: "Streak",
      dataIndex: "streakCount",
      key: "streakCount",
      width: 90,
      sorter: (a: UserRow, b: UserRow) => a.streakCount - b.streakCount,
    },
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify by hand**

Run `npm run dev` and open `/admin/users`.
Expected: Points and Streak columns render with numbers (0 for customers who've never ordered) and both sort.

- [ ] **Step 5: Run the full suite one last time**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/users/page.tsx
git commit -m "$(cat <<'EOF'
feat: reward points and streak columns in admin users

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deployment notes

- **No migration needed.** Every new field is optional and reads as 0 / absent for existing users and orders. A customer's first paid order after deploy starts them at streak day 1, earning 10%.
- **No new environment variables.**
- **New collection** `rewardTransactions` is created implicitly on first insert.
- **New settings document** `{ key: "streakExemptDates" }` is created on the first admin save; until then the exempt set is empty and only weekends are forgiven.
