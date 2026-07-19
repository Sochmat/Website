# First-Subscription Discount + Referral Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every subscriber 20% off their first paid plan and a ₹200-per-referral wallet that auto-reduces future subscription purchases.

**Architecture:** All money is computed and persisted server-side. Plan pricing gets two new stages after `computeBracketPlanTotals`: a first-plan 20% discount, then a wallet reservation capped to leave ≥₹1 payable. Wallet moves through a reserve→settle→refund lifecycle backed by a `walletTransactions` ledger; referrers are credited exactly once at the guaranteed-once `pending→paid` activation in the verify route. Pure pricing/idempotency logic is extracted into testable helpers; DB-touching route wiring follows the existing (untested-route) codebase norm and is checked by running the app.

**Tech Stack:** Next.js 16 App Router, MongoDB native driver (DB `Sochmat`), Razorpay, antd v6, Vitest (pure-function tests only — no test touches the DB).

## Global Constraints

- **Server-side money only.** Never trust a client-supplied amount, discount, or wallet value. Plan pricing is read from Mongo; the Razorpay payment is re-verified against the server's `amountPayable`.
- **Identity via `getCustomerUserId(request)`** (`src/lib/customerSession.ts`) — never a body/query `userId`. Returns `ObjectId | null`; `unauthorized()` for null.
- **GST:** `tax = Math.round(subtotal * GST_RATE)`, `GST_RATE = 0.05` from `src/lib/subscription.ts`.
- **Constants (exact):** `FIRST_PLAN_DISCOUNT_RATE = 0.20`, `MIN_PAYABLE = 1`, `REFERRAL_REWARD = 200`.
- **"First plan" = zero `subscriptionMealPlans` with `paymentStatus: "paid"` for that userId.** Legacy `subscriptions` collection is ignored everywhere.
- **Idempotency:** every balance-moving operation is a guarded `updateOne`/`findOneAndUpdate` that matches at most once, paired with a `walletTransactions` ledger insert.
- **Referral share link:** `https://subscription.sochmat.com/?ref=CODE`.
- Follow existing file conventions: 2-space indent, `NextResponse.json({ success, ... })`, `connectToDatabase()` from `@/lib/mongodb`.

---

### Task 1: Types, constants & pure pricing helpers

**Files:**
- Modify: `src/lib/types.ts` (`User` ~163-176, `SubscriptionMealPlan` ~273-316; add `WalletTransaction`)
- Create: `src/lib/subscriptionDiscount.ts`
- Test: `src/lib/subscriptionDiscount.test.ts`

**Interfaces:**
- Consumes: `BracketPlanTotals` from `src/lib/subscriptionBrackets.ts`, `GST_RATE` from `src/lib/subscription.ts`.
- Produces:
  - `FIRST_PLAN_DISCOUNT_RATE: number`, `MIN_PAYABLE: number`, `REFERRAL_REWARD: number`
  - `applyFirstPlanDiscount(totals: BracketPlanTotals): { discountedSubtotal: number; tax: number; totalAmount: number; firstPlanDiscount: number }`
  - `computeWalletApplied(balance: number, totalAmount: number): { walletApplied: number; amountPayable: number }`
  - `WalletTransaction` type; new `User` fields (`referralCode?`, `referredBy?`, `referralCredited?`, `walletBalance?`); new `SubscriptionMealPlan` fields (`firstPlanDiscount?`, `walletApplied?`, `amountPayable?`).

- [ ] **Step 1: Add types to `src/lib/types.ts`**

Add to the `User` interface (after `updatedAt?: Date;`, before the closing brace):

```typescript
  /** Unique share code, e.g. "SM4K9T". Generated lazily; see src/lib/referral.ts. */
  referralCode?: string;
  /** The referrer's user id. Set once, only at registration, only for a new user. */
  referredBy?: ObjectId | string;
  /** True once the referrer for this user has been paid their ₹200. */
  referralCredited?: boolean;
  /** Integer ₹ wallet balance. Missing means 0. */
  walletBalance?: number;
```

Add to the `SubscriptionMealPlan` interface (after `totalAmount: number;`):

```typescript
  /** ₹ removed by the first-plan 20% discount. 0/absent if not the user's first plan. */
  firstPlanDiscount?: number;
  /** ₹ of wallet reserved against this plan. 0/absent if none. */
  walletApplied?: number;
  /** = totalAmount - walletApplied. What Razorpay charges and what verify matches. */
  amountPayable?: number;
```

Add a new interface at the end of the file:

```typescript
/** Append-only wallet ledger. Collection: `walletTransactions`. `walletBalance`
 *  on the user is the fast-read value; this is the source of truth for support. */
export interface WalletTransaction {
  _id?: ObjectId | string;
  userId: ObjectId | string;
  type: "referral_earned" | "reserved" | "spent" | "refunded";
  /** Always positive ₹; `type` gives the direction. */
  amount: number;
  planId?: ObjectId | string;
  refereeUserId?: ObjectId | string;
  createdAt: Date;
}
```

- [ ] **Step 2: Write the failing test `src/lib/subscriptionDiscount.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  FIRST_PLAN_DISCOUNT_RATE,
  MIN_PAYABLE,
  REFERRAL_REWARD,
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "./subscriptionDiscount";
import type { BracketPlanTotals } from "./subscriptionBrackets";

const totals = (subtotal: number): BracketPlanTotals => ({
  pricePerMeal: subtotal / 7,
  mealCount: 7,
  subtotal,
  tax: Math.round(subtotal * 0.05),
  totalAmount: subtotal + Math.round(subtotal * 0.05),
});

describe("constants", () => {
  it("are the agreed values", () => {
    expect(FIRST_PLAN_DISCOUNT_RATE).toBe(0.2);
    expect(MIN_PAYABLE).toBe(1);
    expect(REFERRAL_REWARD).toBe(200);
  });
});

describe("applyFirstPlanDiscount", () => {
  it("takes 20% off the subtotal and recomputes GST", () => {
    // subtotal 700 -> discounted 560, tax 28, total 588; original total 735
    const r = applyFirstPlanDiscount(totals(700));
    expect(r.discountedSubtotal).toBe(560);
    expect(r.tax).toBe(28);
    expect(r.totalAmount).toBe(588);
    expect(r.firstPlanDiscount).toBe(147);
  });
});

describe("computeWalletApplied", () => {
  it("applies the whole balance when it fits", () => {
    expect(computeWalletApplied(200, 588)).toEqual({
      walletApplied: 200,
      amountPayable: 388,
    });
  });
  it("caps so at least MIN_PAYABLE remains chargeable", () => {
    expect(computeWalletApplied(1000, 588)).toEqual({
      walletApplied: 587,
      amountPayable: 1,
    });
  });
  it("applies nothing for a zero/empty balance", () => {
    expect(computeWalletApplied(0, 588)).toEqual({
      walletApplied: 0,
      amountPayable: 588,
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/subscriptionDiscount.test.ts`
Expected: FAIL — cannot resolve `./subscriptionDiscount`.

- [ ] **Step 4: Create `src/lib/subscriptionDiscount.ts`**

```typescript
import { GST_RATE } from "./subscription";
import type { BracketPlanTotals } from "./subscriptionBrackets";

/** Discount on a customer's first paid subscription plan. */
export const FIRST_PLAN_DISCOUNT_RATE = 0.2;
/** Razorpay cannot charge ₹0, so wallet always leaves at least this much payable. */
export const MIN_PAYABLE = 1;
/** ₹ credited to a referrer when their referee's first plan is paid. */
export const REFERRAL_REWARD = 200;

/**
 * 20% off the pre-GST subtotal, with GST recomputed on the discounted subtotal.
 * `firstPlanDiscount` is the ₹ removed from the grand total.
 */
export function applyFirstPlanDiscount(totals: BracketPlanTotals): {
  discountedSubtotal: number;
  tax: number;
  totalAmount: number;
  firstPlanDiscount: number;
} {
  const discountedSubtotal = Math.round(
    totals.subtotal * (1 - FIRST_PLAN_DISCOUNT_RATE),
  );
  const tax = Math.round(discountedSubtotal * GST_RATE);
  const totalAmount = discountedSubtotal + tax;
  return {
    discountedSubtotal,
    tax,
    totalAmount,
    firstPlanDiscount: totals.totalAmount - totalAmount,
  };
}

/**
 * How much wallet balance to apply to a plan, capped so at least MIN_PAYABLE
 * remains for Razorpay to charge.
 */
export function computeWalletApplied(
  balance: number,
  totalAmount: number,
): { walletApplied: number; amountPayable: number } {
  const spendable = Math.max(0, totalAmount - MIN_PAYABLE);
  const walletApplied = Math.max(0, Math.min(Math.floor(balance), spendable));
  return { walletApplied, amountPayable: totalAmount - walletApplied };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/subscriptionDiscount.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/types.ts src/lib/subscriptionDiscount.ts src/lib/subscriptionDiscount.test.ts
git commit -m "feat: types + pure helpers for first-plan discount and wallet cap"
```

---

### Task 2: Wallet ledger operations (`src/lib/wallet.ts`)

DB-touching helpers for the reserve→settle→refund lifecycle and the stale-plan safety sweep. No unit test (matches the codebase: no test touches Mongo); correctness is exercised end-to-end in Task 4/6/7.

**Files:**
- Create: `src/lib/wallet.ts`

**Interfaces:**
- Consumes: `Db`/`ObjectId` from `mongodb`, `WalletTransaction` from `./types`.
- Produces:
  - `getWalletBalance(db, userId): Promise<number>`
  - `reserveWallet(db, userId, planId, amount): Promise<boolean>` — atomic guarded decrement + `reserved` ledger. `amount<=0` → true no-op. `false` if balance insufficient.
  - `settleWallet(db, userId, planId, amount): Promise<void>` — `spent` ledger only (balance already decremented at reserve). No-op if `amount<=0`.
  - `refundReservationForPlan(db, planId, userId): Promise<number>` — idempotent; returns ₹ refunded (0 if nothing eligible).
  - `sweepStalePlanReservations(db, userId, olderThanMs): Promise<void>` — refund reservations on this user's `pending` plans older than the cutoff.
  - `creditReferral(db, refereeUserId): Promise<void>` — idempotent ₹200 to the referrer of a just-paid first plan.

- [ ] **Step 1: Create `src/lib/wallet.ts`**

```typescript
import { Db, ObjectId } from "mongodb";
import { REFERRAL_REWARD } from "./subscriptionDiscount";
import type { WalletTransaction } from "./types";

const USERS = "users";
const PLANS = "subscriptionMealPlans";
const LEDGER = "walletTransactions";

function ledgerEntry(
  e: Omit<WalletTransaction, "createdAt">,
): WalletTransaction {
  return { ...e, createdAt: new Date() };
}

export async function getWalletBalance(
  db: Db,
  userId: ObjectId,
): Promise<number> {
  const user = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { walletBalance: 1 } });
  return Number(user?.walletBalance ?? 0);
}

/**
 * Atomically hold `amount` from the user's balance for a plan. Guarded on
 * sufficient balance so it can't go negative or double-spend across concurrent
 * checkouts. Returns false (and reserves nothing) if the balance moved underneath.
 */
export async function reserveWallet(
  db: Db,
  userId: ObjectId,
  planId: ObjectId,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const res = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount }, $set: { updatedAt: new Date() } },
    );
  if (res.matchedCount === 0) return false;
  await db
    .collection(LEDGER)
    .insertOne(ledgerEntry({ userId, planId, type: "reserved", amount }));
  return true;
}

/** Reserved → spent. The balance was already decremented at reserve time. */
export async function settleWallet(
  db: Db,
  userId: ObjectId,
  planId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection(LEDGER)
    .insertOne(ledgerEntry({ userId, planId, type: "spent", amount }));
}

/**
 * Return a pending plan's reservation to the wallet. Idempotent: the plan's
 * `walletApplied` is zeroed in the same guarded update, so a second call is a
 * no-op. Returns the ₹ refunded.
 */
export async function refundReservationForPlan(
  db: Db,
  planId: ObjectId,
  userId: ObjectId,
): Promise<number> {
  const before = await db.collection(PLANS).findOneAndUpdate(
    {
      _id: planId,
      userId,
      paymentStatus: "pending",
      walletApplied: { $gt: 0 },
    },
    [
      {
        $set: {
          walletApplied: 0,
          amountPayable: "$totalAmount",
          updatedAt: new Date(),
        },
      },
    ],
    { returnDocument: "before" },
  );
  const amount = Number(before?.walletApplied ?? 0);
  if (amount <= 0) return 0;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { walletBalance: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection(LEDGER)
    .insertOne(ledgerEntry({ userId, planId, type: "refunded", amount }));
  return amount;
}

/** Safety net for checkouts abandoned before the client fail-call fired. */
export async function sweepStalePlanReservations(
  db: Db,
  userId: ObjectId,
  olderThanMs: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .collection(PLANS)
    .find(
      {
        userId,
        paymentStatus: "pending",
        walletApplied: { $gt: 0 },
        createdAt: { $lt: cutoff },
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const p of stale) {
    await refundReservationForPlan(db, p._id as ObjectId, userId);
  }
}

/**
 * Credit the referrer ₹200 when their referee's first plan is paid. Idempotent:
 * flips the referee's `referralCredited` flag first and only pays if that flip
 * matched, so a retried verify never double-pays.
 */
export async function creditReferral(
  db: Db,
  refereeUserId: ObjectId,
): Promise<void> {
  const referee = await db
    .collection(USERS)
    .findOne(
      { _id: refereeUserId },
      { projection: { referredBy: 1, referralCredited: 1 } },
    );
  if (!referee?.referredBy || referee.referralCredited) return;

  const claimed = await db
    .collection(USERS)
    .updateOne(
      { _id: refereeUserId, referralCredited: { $ne: true } },
      { $set: { referralCredited: true, updatedAt: new Date() } },
    );
  if (claimed.matchedCount === 0) return; // someone else already credited

  const referrerId = new ObjectId(String(referee.referredBy));
  await db
    .collection(USERS)
    .updateOne(
      { _id: referrerId },
      {
        $inc: { walletBalance: REFERRAL_REWARD },
        $set: { updatedAt: new Date() },
      },
    );
  await db.collection(LEDGER).insertOne(
    ledgerEntry({
      userId: referrerId,
      refereeUserId,
      type: "referral_earned",
      amount: REFERRAL_REWARD,
    }),
  );
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/wallet.ts
git commit -m "feat: wallet ledger ops (reserve/settle/refund/sweep/referral credit)"
```

---

### Task 3: Referral code generation (`src/lib/referral.ts`)

**Files:**
- Create: `src/lib/referral.ts`
- Test: `src/lib/referral.test.ts`

**Interfaces:**
- Produces:
  - `randomReferralCode(rand?: () => number): string` — pure; format `SM` + 4 unambiguous chars.
  - `getOrCreateReferralCode(db, userId): Promise<string>` — returns existing code or assigns a unique one (unique sparse index on `users.referralCode`).
  - `findUserIdByReferralCode(db, code): Promise<ObjectId | null>`

- [ ] **Step 1: Write the failing test `src/lib/referral.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { randomReferralCode } from "./referral";

describe("randomReferralCode", () => {
  it("is SM + 4 unambiguous uppercase chars", () => {
    const code = randomReferralCode(() => 0);
    expect(code).toMatch(/^SM[A-Z0-9]{4}$/);
    expect(code).toHaveLength(6);
  });
  it("never emits ambiguous chars (0/O/1/I)", () => {
    for (let i = 0; i < 32; i++) {
      const code = randomReferralCode(() => i / 32);
      expect(code.slice(2)).not.toMatch(/[01OI]/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/referral.test.ts`
Expected: FAIL — cannot resolve `./referral`.

- [ ] **Step 3: Create `src/lib/referral.ts`**

```typescript
import { Db, ObjectId } from "mongodb";

const USERS = "users";
// No 0/O/1/I to keep shared codes unambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomReferralCode(rand: () => number = Math.random): string {
  let code = "SM";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return code;
}

let indexReady: Promise<unknown> | null = null;
function ensureIndex(db: Db): Promise<unknown> {
  if (!indexReady) {
    indexReady = db
      .collection(USERS)
      .createIndex({ referralCode: 1 }, { unique: true, sparse: true })
      .catch(() => {
        indexReady = null; // allow a later retry if this attempt failed
      });
  }
  return indexReady;
}

/** The user's referral code, assigning a unique one on first use. */
export async function getOrCreateReferralCode(
  db: Db,
  userId: ObjectId,
): Promise<string> {
  const existing = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { referralCode: 1 } });
  if (existing?.referralCode) return existing.referralCode;

  await ensureIndex(db);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomReferralCode();
    try {
      const res = await db
        .collection(USERS)
        .updateOne(
          { _id: userId, referralCode: { $exists: false } },
          { $set: { referralCode: code, updatedAt: new Date() } },
        );
      if (res.matchedCount === 0) {
        // Set concurrently by another request; read it back.
        const now = await db
          .collection(USERS)
          .findOne({ _id: userId }, { projection: { referralCode: 1 } });
        if (now?.referralCode) return now.referralCode;
      } else {
        return code;
      }
    } catch (e) {
      // Duplicate code (unique index) — retry with a fresh one.
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

export async function findUserIdByReferralCode(
  db: Db,
  code: string,
): Promise<ObjectId | null> {
  const trimmed = String(code ?? "").trim().toUpperCase();
  if (!trimmed) return null;
  const user = await db
    .collection(USERS)
    .findOne({ referralCode: trimmed }, { projection: { _id: 1 } });
  return (user?._id as ObjectId) ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/referral.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/referral.ts src/lib/referral.test.ts
git commit -m "feat: referral code generation + lookup"
```

---

### Task 4: Apply discount + reserve wallet in plan creation

**Files:**
- Modify: `src/app/api/subscriptions/plans/route.ts` (POST ~73-119; GET add sweep ~135)

**Interfaces:**
- Consumes: `applyFirstPlanDiscount`, `computeWalletApplied` (Task 1); `reserveWallet`, `getWalletBalance`, `sweepStalePlanReservations` (Task 2).
- Produces: created plans now carry `firstPlanDiscount`, `walletApplied`, `amountPayable`; the POST response `plan` includes them.

- [ ] **Step 1: Add imports at the top of `plans/route.ts`**

After the existing `import { getCustomerUserId, unauthorized } ...` line, add:

```typescript
import {
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "@/lib/subscriptionDiscount";
import {
  getWalletBalance,
  reserveWallet,
  sweepStalePlanReservations,
} from "@/lib/wallet";
```

- [ ] **Step 2: Compute discount + wallet before building `planDoc`**

Replace the block that currently reads:

```typescript
    const credits: SubscriptionCredit[] = Array.from(
      { length: MEALS_PER_PLAN },
      (_, i) => ({ id: `c${i + 1}`, status: "available" as const }),
    );

    const now = new Date();
```

with:

```typescript
    const credits: SubscriptionCredit[] = Array.from(
      { length: MEALS_PER_PLAN },
      (_, i) => ({ id: `c${i + 1}`, status: "available" as const }),
    );

    // First-plan 20% discount: only when this user has no prior PAID plan.
    const priorPaid = await db
      .collection("subscriptionMealPlans")
      .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });

    let subtotal = totals.subtotal;
    let tax = totals.tax;
    let totalAmount = totals.totalAmount;
    let firstPlanDiscount = 0;
    if (!priorPaid) {
      const discounted = applyFirstPlanDiscount(totals);
      subtotal = discounted.discountedSubtotal;
      tax = discounted.tax;
      totalAmount = discounted.totalAmount;
      firstPlanDiscount = discounted.firstPlanDiscount;
    }

    const now = new Date();
```

- [ ] **Step 3: Persist the new money fields on `planDoc`**

In the `planDoc` object literal, change the three price lines and add the new ones. Replace:

```typescript
      pricePerMeal: totals.pricePerMeal,
      mealCount: totals.mealCount,
      subtotal: totals.subtotal,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
```

with:

```typescript
      pricePerMeal: totals.pricePerMeal,
      mealCount: totals.mealCount,
      subtotal,
      tax,
      totalAmount,
      firstPlanDiscount,
      // Wallet is reserved after insert (needs the plan _id); provisional here.
      walletApplied: 0,
      amountPayable: totalAmount,
```

- [ ] **Step 4: Reserve wallet after insert, then return the reconciled plan**

Replace:

```typescript
    const result = await db.collection("subscriptionMealPlans").insertOne(planDoc);
    return NextResponse.json({
      success: true,
      plan: { ...planDoc, _id: result.insertedId },
    });
```

with:

```typescript
    const result = await db.collection("subscriptionMealPlans").insertOne(planDoc);
    const planId = result.insertedId;

    // Reserve wallet against the just-created plan. Capped to leave >= MIN_PAYABLE.
    const balance = await getWalletBalance(db, userId);
    const { walletApplied, amountPayable } = computeWalletApplied(
      balance,
      totalAmount,
    );
    let reservedApplied = 0;
    let reservedPayable = totalAmount;
    if (walletApplied > 0 && (await reserveWallet(db, userId, planId, walletApplied))) {
      reservedApplied = walletApplied;
      reservedPayable = amountPayable;
      await db
        .collection("subscriptionMealPlans")
        .updateOne(
          { _id: planId },
          { $set: { walletApplied: reservedApplied, amountPayable: reservedPayable } },
        );
    }

    return NextResponse.json({
      success: true,
      plan: {
        ...planDoc,
        _id: planId,
        walletApplied: reservedApplied,
        amountPayable: reservedPayable,
      },
    });
```

- [ ] **Step 5: Add the stale-reservation sweep to GET**

In the `GET` handler, immediately after `const { db } = await connectToDatabase();` and before the `.find({ userId })`, add:

```typescript
    // Return wallet held by checkouts abandoned before the fail-call fired.
    await sweepStalePlanReservations(db, userId, 30 * 60 * 1000);
```

- [ ] **Step 6: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual check (dev server, subscription subdomain, signed-in test user):
1. As a brand-new user, open checkout → the created plan's `totalAmount` is 80% of subtotal + recomputed GST, `firstPlanDiscount > 0`, `walletApplied: 0`, `amountPayable === totalAmount`.
2. Give the user a `walletBalance` (e.g. set `walletBalance: 200` on the user in Mongo), create another plan → `walletApplied: 200`, `amountPayable === totalAmount - 200`, and the user's `walletBalance` dropped to 0 with a `reserved` row in `walletTransactions`.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/subscriptions/plans/route.ts
git commit -m "feat: first-plan discount + wallet reservation on plan creation"
```

---

### Task 5: Pricing quote endpoint for checkout preview

**Files:**
- Create: `src/app/api/subscriptions/plans/quote/route.ts`

**Interfaces:**
- Consumes: `computeBracketPlanTotals`, `isBracketKey`, `isDiet` (`@/lib/subscriptionBrackets`); `applyFirstPlanDiscount`, `computeWalletApplied` (Task 1); `getWalletBalance` (Task 2); `getCustomerUserId`.
- Produces: `GET /api/subscriptions/plans/quote?bracket=&diet=` → `{ success, quote: { subtotal, tax, totalAmount, firstPlanDiscount, isFirstPlan, walletBalance, walletApplied, amountPayable } }`. Display-only; the authoritative recompute is still Task 4.

- [ ] **Step 1: Create `src/app/api/subscriptions/plans/quote/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  computeBracketPlanTotals,
  isBracketKey,
  isDiet,
} from "@/lib/subscriptionBrackets";
import {
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "@/lib/subscriptionDiscount";
import { getWalletBalance } from "@/lib/wallet";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import type { SubscriptionBracket } from "@/lib/types";

/** Display-only price preview for the signed-in customer. Never trusted for money. */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { searchParams } = new URL(request.url);
    const bracket = searchParams.get("bracket");
    const diet = searchParams.get("diet");
    if (!isBracketKey(bracket)) {
      return NextResponse.json({ success: false, message: "Unknown bracket" }, { status: 400 });
    }
    if (!isDiet(diet)) {
      return NextResponse.json({ success: false, message: "Unknown diet" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const bracketDoc = (await db
      .collection("subscriptionBrackets")
      .findOne({ key: bracket, active: { $ne: false } })) as unknown as SubscriptionBracket | null;
    if (!bracketDoc) {
      return NextResponse.json(
        { success: false, message: "That plan is not available right now" },
        { status: 400 },
      );
    }

    let totals;
    try {
      totals = computeBracketPlanTotals(bracketDoc, diet);
    } catch (e) {
      return NextResponse.json({ success: false, message: (e as Error).message }, { status: 400 });
    }

    const priorPaid = await db
      .collection("subscriptionMealPlans")
      .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });
    const isFirstPlan = !priorPaid;

    let { subtotal, tax, totalAmount } = totals;
    let firstPlanDiscount = 0;
    if (isFirstPlan) {
      const d = applyFirstPlanDiscount(totals);
      subtotal = d.discountedSubtotal;
      tax = d.tax;
      totalAmount = d.totalAmount;
      firstPlanDiscount = d.firstPlanDiscount;
    }

    const walletBalance = await getWalletBalance(db, userId);
    const { walletApplied, amountPayable } = computeWalletApplied(walletBalance, totalAmount);

    return NextResponse.json({
      success: true,
      quote: {
        subtotal,
        tax,
        totalAmount,
        firstPlanDiscount,
        isFirstPlan,
        walletBalance,
        walletApplied,
        amountPayable,
      },
    });
  } catch (error) {
    console.error("Error building plan quote:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build quote" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual: signed in, `GET /api/subscriptions/plans/quote?bracket=25-30&diet=veg` returns a quote whose `totalAmount`/`amountPayable` match what Task 4 would persist for the same user.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscriptions/plans/quote/route.ts
git commit -m "feat: subscription plan pricing quote endpoint"
```

---

### Task 6: Verify — match amountPayable, settle wallet, credit referral

**Files:**
- Modify: `src/app/api/subscriptions/plans/verify/route.ts` (amount check ~102-119; after activation ~148-154)

**Interfaces:**
- Consumes: `settleWallet`, `creditReferral` (Task 2).
- Produces: the pending→paid path now charges/matches `amountPayable`, settles the reservation, and credits the referrer once.

- [ ] **Step 1: Add imports**

After `import { getCustomerUserId, unauthorized } from "@/lib/customerSession";`, add:

```typescript
import { settleWallet, creditReferral } from "@/lib/wallet";
```

- [ ] **Step 2: Match the payment against `amountPayable`, not `totalAmount`**

Replace:

```typescript
    const expectedAmount = Math.round(Number(plan.totalAmount) * 100);
```

with:

```typescript
    // Wallet-reduced net is what Razorpay was told to charge. Falls back to
    // totalAmount for plans created before the wallet feature (amountPayable unset).
    const payable = Number(plan.amountPayable ?? plan.totalAmount);
    const expectedAmount = Math.round(payable * 100);
```

- [ ] **Step 3: Settle wallet + credit referral after activation**

Replace:

```typescript
    if (result.matchedCount === 0) {
      // Someone else activated it between step 2 and here. Still a success.
      return NextResponse.json({ success: true, message: "Payment already verified" });
    }

    return NextResponse.json({ success: true, message: "Payment verified successfully!" });
```

with:

```typescript
    if (result.matchedCount === 0) {
      // Someone else activated it between step 2 and here. Still a success.
      return NextResponse.json({ success: true, message: "Payment already verified" });
    }

    // This branch runs at most once per plan (guarded on paymentStatus:"pending").
    const walletApplied = Number(plan.walletApplied ?? 0);
    if (walletApplied > 0) {
      await settleWallet(db, userId, _id, walletApplied);
    }
    // Reward the referrer if this is the buyer's first paid plan.
    await creditReferral(db, userId);

    return NextResponse.json({ success: true, message: "Payment verified successfully!" });
```

- [ ] **Step 4: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual (dev, test Razorpay keys):
1. Pay for a wallet-discounted plan → Razorpay amount equals `amountPayable`; verify succeeds; the plan's `reserved` ledger row is joined by a `spent` row; the user's `walletBalance` stays at its post-reservation value (not re-decremented).
2. Referral: user B registered with A's code (Task 8), B pays their first plan → A's `walletBalance` increases by 200, a `referral_earned` row exists, B's `referralCredited` is true. Re-POST the same verify → no second credit.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/subscriptions/plans/verify/route.ts
git commit -m "feat: verify charges net amount, settles wallet, credits referral"
```

---

### Task 7: Plan-abandonment refund route

**Files:**
- Create: `src/app/api/subscriptions/plans/[planId]/fail/route.ts`
- Modify: `src/app/subscription/page.tsx` (checkout `onError` ~396-399) — call the fail route

**Interfaces:**
- Consumes: `refundReservationForPlan` (Task 2); `getCustomerUserId`.
- Produces: `POST /api/subscriptions/plans/:planId/fail` → refunds a pending plan's reservation (idempotent).

- [ ] **Step 1: Create `src/app/api/subscriptions/plans/[planId]/fail/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { refundReservationForPlan } from "@/lib/wallet";

/**
 * Called when a plan's Razorpay payment fails or is dismissed. Refunds any
 * reserved wallet back to the customer. Idempotent and ownership-checked; only
 * touches a still-`pending` plan, so a later successful retry is never disturbed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { planId } = await params;
    if (!planId || !ObjectId.isValid(planId)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const refunded = await refundReservationForPlan(db, new ObjectId(planId), userId);
    return NextResponse.json({ success: true, refunded });
  } catch (error) {
    console.error("Error failing subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to release plan" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Call the fail route from the checkout `onError`**

In `src/app/subscription/page.tsx`, the `handleRazorpayPayment` call currently has:

```typescript
        failUrl: null,
        onSuccess: () => router.push(`/subscription/success?planId=${planId}`),
        onError: (err) => {
          message.error(err.message || "Payment failed");
          setPlacing(false);
        },
```

Replace the `onError` body so it releases the reservation (keep `failUrl: null` — the built-in helper posts `{ orderId }`, which plans don't use):

```typescript
        failUrl: null,
        onSuccess: () => router.push(`/subscription/success?planId=${planId}`),
        onError: (err) => {
          // Best-effort: return any reserved wallet so a cancelled checkout
          // doesn't hold the customer's balance until the sweep runs.
          fetch(`/api/subscriptions/plans/${planId}/fail`, { method: "POST" }).catch(
            () => {},
          );
          message.error(err.message || "Payment failed");
          setPlacing(false);
        },
```

- [ ] **Step 3: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual: create a wallet-discounted plan, then cancel the Razorpay modal → the user's `walletBalance` is restored, the plan's `walletApplied` is 0, `amountPayable === totalAmount`, and a `refunded` ledger row exists. POST the fail route again → `refunded: 0`, balance unchanged.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/subscriptions/plans/[planId]/fail/route.ts" src/app/subscription/page.tsx
git commit -m "feat: refund reserved wallet when a plan checkout fails/cancels"
```

---

### Task 8: Capture referral code at registration

**Files:**
- Modify: `src/app/api/users/otp/register/route.ts` (new-user creation ~44-52)

**Interfaces:**
- Consumes: `findUserIdByReferralCode` (Task 3).
- Produces: a new user created with a valid, non-self `ref` gets `referredBy` set. Existing users are never modified. `ref` is read from the request body.

- [ ] **Step 1: Add the import**

After the existing imports in `register/route.ts`, add:

```typescript
import { findUserIdByReferralCode } from "@/lib/referral";
```

- [ ] **Step 2: Read `ref` from the body**

Where the body fields are parsed (near `const name = body.name ? ...`), add:

```typescript
    const ref = body.ref ? String(body.ref).trim().toUpperCase() : "";
```

- [ ] **Step 3: Set `referredBy` only when creating a new user**

In the `else if (!user)` branch, the new user is built as `newUser`. Just before `const result = await db.collection("users").insertOne(newUser);`, add:

```typescript
      // Attribute the referral once, at signup, and never to yourself.
      if (ref) {
        const referrerId = await findUserIdByReferralCode(db, ref);
        if (referrerId) newUser.referredBy = referrerId;
      }
```

(The new user has no `_id` yet, so self-referral is structurally impossible here; a referrer only ever points at a pre-existing account.)

- [ ] **Step 4: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual: with user A holding `referralCode` "SMxxxx", register a brand-new user B posting `{ email, name, ref: "SMxxxx" }` → B's user doc has `referredBy` = A's `_id`. Re-register an existing user with a `ref` → their `referredBy` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/otp/register/route.ts
git commit -m "feat: capture referral code at registration"
```

---

### Task 9: Checkout UI — net amount, discount & wallet lines, capture ?ref

**Files:**
- Modify: `src/app/subscription/page.tsx` (charge amount ~382; summary ~665-680; add `?ref` capture + quote fetch)
- Modify: `src/components/LoginPopup.tsx` (register payload ~74-82, ~130-138) — forward stashed `ref`

**Interfaces:**
- Consumes: `GET /api/subscriptions/plans/quote` (Task 5); the plan POST response's `amountPayable` (Task 4).
- Produces: checkout charges `amountPayable`; summary shows the first-plan discount and wallet applied; `?ref=CODE` is stashed and forwarded to registration.

- [ ] **Step 1: Charge the net amount**

In `handlePlaceOrder` (or the checkout handler), change the Razorpay amount from the gross total to the server-returned net:

```typescript
        amount: data.plan.amountPayable ?? data.plan.totalAmount,
```

(Replaces `amount: data.plan.totalAmount,`.)

- [ ] **Step 2: Stash `?ref` on mount**

Near the top of the subscription page component, add an effect that persists any referral code from the URL so it survives until the user registers:

```typescript
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("sochmat_ref", ref.trim().toUpperCase());
  }, []);
```

- [ ] **Step 3: Fetch and show the quote in the order summary**

Add state and a fetch that runs when the selected bracket/diet changes (place alongside the other summary logic near line 196):

```typescript
  const [quote, setQuote] = useState<{
    totalAmount: number;
    firstPlanDiscount: number;
    walletApplied: number;
    amountPayable: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedBracket || !isAuthenticated) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/subscriptions/plans/quote?bracket=${selectedBracket.key}&diet=${diet}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setQuote(d.quote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedBracket, diet, isAuthenticated]);
```

In the summary block (where `totals.subtotal` and `totals.tax` are rendered, ~665-680), add two conditional rows after the tax row:

```tsx
                {quote && quote.firstPlanDiscount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>First-plan discount (20%)</span>
                    <span className="tabular-nums">
                      -{rupees(quote.firstPlanDiscount)}
                    </span>
                  </div>
                )}
                {quote && quote.walletApplied > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Wallet applied</span>
                    <span className="tabular-nums">
                      -{rupees(quote.walletApplied)}
                    </span>
                  </div>
                )}
```

And render the payable total from the quote when present (the "to pay" line): use `quote ? quote.amountPayable : totals.total` for the amount shown as the final payable figure.

- [ ] **Step 4: Forward the stashed `ref` from LoginPopup registration**

In `src/components/LoginPopup.tsx`, both `handleSendOTP` and `handleResendOTP` build the register payload as `{ email, name }`. Change the register-mode payload in both places to include the stashed code:

```typescript
      const payload =
        mode === "register"
          ? {
              email: email.trim().toLowerCase(),
              name: name.trim(),
              ref:
                typeof window !== "undefined"
                  ? localStorage.getItem("sochmat_ref") ?? undefined
                  : undefined,
            }
          : { email: email.trim().toLowerCase() };
```

- [ ] **Step 5: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual:
1. New user, checkout summary shows "First-plan discount (20%) -₹X" and the payable equals the discounted total; paying charges exactly that.
2. User with wallet balance sees "Wallet applied -₹Y" and pays `total - Y`.
3. Visit `subscription.sochmat.com/?ref=SMxxxx`, register a new account through the login popup → the new user's `referredBy` is set.

- [ ] **Step 6: Commit**

```bash
git add src/app/subscription/page.tsx src/components/LoginPopup.tsx
git commit -m "feat: checkout shows discount + wallet, charges net, forwards referral code"
```

---

### Task 10: Refer & Earn page + referral summary endpoint

**Files:**
- Create: `src/app/api/referral/me/route.ts`
- Create: `src/app/subscription/refer/page.tsx`

**Interfaces:**
- Consumes: `getOrCreateReferralCode` (Task 3); `getCustomerUserId`; `walletTransactions`, `users`.
- Produces: `GET /api/referral/me` → `{ success, referralCode, shareUrl, walletBalance, referralCount, earned }`; a client page rendering them.

- [ ] **Step 1: Create `src/app/api/referral/me/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { getOrCreateReferralCode } from "@/lib/referral";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { db } = await connectToDatabase();
    const referralCode = await getOrCreateReferralCode(db, userId);

    const user = await db
      .collection("users")
      .findOne({ _id: userId }, { projection: { walletBalance: 1 } });
    const earnedRows = await db
      .collection("walletTransactions")
      .find({ userId, type: "referral_earned" })
      .toArray();
    const earned = earnedRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    return NextResponse.json({
      success: true,
      referralCode,
      shareUrl: `https://subscription.sochmat.com/?ref=${referralCode}`,
      walletBalance: Number(user?.walletBalance ?? 0),
      referralCount: earnedRows.length,
      earned,
    });
  } catch (error) {
    console.error("Error building referral summary:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load referral info" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create `src/app/subscription/refer/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { message } from "antd";

interface ReferralInfo {
  referralCode: string;
  shareUrl: string;
  walletBalance: number;
  referralCount: number;
  earned: number;
}

export default function ReferPage() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/referral/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInfo(d);
        else message.error(d.message ?? "Please sign in to see your referral code");
      })
      .catch(() => message.error("Failed to load referral info"))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success("Copied");
    } catch {
      message.error("Could not copy");
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (!info) return <div className="p-6">Sign in to view your referral code.</div>;

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Refer &amp; Earn</h1>
        <p className="text-gray-600">
          Share your code. When a friend buys their first subscription, you get
          ₹200 in wallet credit — used automatically on your next plan.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm text-gray-500">Your referral code</div>
        <div className="flex items-center justify-between">
          <span className="text-xl font-mono tracking-widest">
            {info.referralCode}
          </span>
          <button
            className="rounded bg-black px-3 py-1 text-sm text-white"
            onClick={() => copy(info.referralCode)}
          >
            Copy code
          </button>
        </div>
        <button
          className="w-full rounded border px-3 py-2 text-sm"
          onClick={() => copy(info.shareUrl)}
        >
          Copy share link
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-semibold">₹{info.walletBalance}</div>
          <div className="text-xs text-gray-500">Wallet balance</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-semibold">{info.referralCount}</div>
          <div className="text-xs text-gray-500">Friends joined</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-semibold">₹{info.earned}</div>
          <div className="text-xs text-gray-500">Total earned</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual: signed in, open `subscription.sochmat.com/refer` → a code appears (assigned on first load if absent), the share link contains that code, and balance/count/earned reflect `walletTransactions`. Copy buttons work.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/referral/me/route.ts "src/app/subscription/refer/page.tsx"
git commit -m "feat: Refer & Earn page + referral summary endpoint"
```

---

### Task 11: Admin — show wallet balance on the users page

**Files:**
- Modify: `src/app/admin/users/page.tsx` (users table) and/or its data source

**Interfaces:**
- Consumes: existing admin users list.
- Produces: a read-only `Wallet` column showing `walletBalance` (₹, default 0).

- [ ] **Step 1: Inspect the admin users page and its data source**

Run: `sed -n '1,60p' src/app/admin/users/page.tsx` and check the matching `src/app/api/admin/users` route to confirm whether `walletBalance` is already returned (it comes straight off the user doc). If the API projects specific fields, ensure `walletBalance` is included.

- [ ] **Step 2: Add a read-only Wallet column**

Add a column to the antd `Table` `columns` array (match the file's existing column style):

```tsx
  {
    title: "Wallet",
    dataIndex: "walletBalance",
    key: "walletBalance",
    render: (v?: number) => `₹${Number(v ?? 0)}`,
  },
```

If the admin users API restricts returned fields, add `walletBalance: 1` to its projection so the value reaches the table.

- [ ] **Step 3: Typecheck & manually verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Manual: open the admin users page → each row shows a Wallet ₹ value; a user who earned a referral shows ₹200 (or their current balance).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/users/page.tsx
git commit -m "feat: show wallet balance on admin users page"
```

---

## Self-Review

**Spec coverage:**
- 20% first-plan discount → Task 1 (helper) + Task 4 (applied in creation) + Task 5/9 (preview/UI). ✓
- Wallet data model (`walletBalance`, `walletTransactions`, plan fields) → Task 1. ✓
- Reserve/settle/refund lifecycle → Task 2 + Task 4 (reserve) + Task 6 (settle) + Task 7 (refund) + Task 4 GET (sweep). ✓
- Charge & verify net `amountPayable` → Task 4 (persist) + Task 6 (match) + Task 9 (charge). ✓
- Referral code generation + capture + earn → Task 3 + Task 8 + Task 6 (`creditReferral`). ✓
- Stacking (discount then wallet) → Task 4 ordering. ✓
- ₹1 minimum payable cap → Task 1 `computeWalletApplied` + tests. ✓
- Idempotency of every balance move → guarded updates in Task 2, exercised in 4/6/7. ✓
- UI: checkout lines, Refer & Earn page, admin wallet → Tasks 9, 10, 11. ✓
- Out of scope (friend reward, cash payout, caps, à-la-carte) → not implemented, correct. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 11 Step 1 is an inspection step (the file wasn't read while planning) but Step 2 gives the exact column to add — acceptable.

**Type consistency:** `applyFirstPlanDiscount`/`computeWalletApplied` signatures match between Task 1 definition and Tasks 4/5 usage. `reserveWallet`/`settleWallet`/`refundReservationForPlan`/`sweepStalePlanReservations`/`creditReferral`/`getWalletBalance` signatures match between Task 2 and Tasks 4/6/7. `getOrCreateReferralCode`/`findUserIdByReferralCode` match between Task 3 and Tasks 8/10. Plan fields `firstPlanDiscount`/`walletApplied`/`amountPayable` and `WalletTransaction` are defined in Task 1 and used consistently after.
