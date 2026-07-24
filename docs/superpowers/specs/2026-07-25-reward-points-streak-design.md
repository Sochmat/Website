# Reward points with a daily order streak

**Date:** 2026-07-25
**Status:** Approved

## Goal

Give à-la-carte customers a reason to order every working day. Each paid order
earns reward points as a percentage of the pre-tax bill, and that percentage
climbs the longer the customer's daily ordering streak runs — 10% on the first
day, then 12, 14, 16, 18, and capping at 20%. Missing a working day resets the
rate to 10%. Weekends never count against the streak.

Points are spendable as ₹1 each on any later order, with the whole balance
redeemable at once.

## Scope

**In:** the à-la-carte flow (`/order` → `create-order` → `verify-order` /
webhook), its admin refund path, and the customer-facing surfaces that display
points and streak.

**Out:** the subscription flow. Subscription plans are a bulk pre-purchase with
their own first-plan discount, and a subscriber who has already paid has no
daily order event to hang a streak on. Subscription purchases neither earn
points, advance streaks, nor redeem points. No change to the subscription
payment path.

**Deferred (not v1):** point expiry, partial/slider redemption, streak freezes
or purchasable streak repairs.

## Approach: compute-on-read (no cron)

A streak is never expired by a background job. It is derived at order time by
comparing the user's stored `streakLastDate` against today's IST date. This
matches `getEffectiveStoreOpen` and `isEligibleForFirstOrderDiscount`, both of
which resolve state live rather than from a scheduled writer. A nightly
reset job would add a moving part that can silently stop, and buys nothing:
nothing needs to observe a lapsed streak until the customer orders again.

## Relationship to the existing wallet

The repo already has a ₹ wallet (`users.walletBalance` + the
`walletTransactions` ledger, `src/lib/wallet.ts`) fed by the ₹100 referral
reward. Reward points are a **separate balance with a separate ledger**, so the
UI can distinguish "streak reward" from "referral credit" and so points can
later grow their own expiry or cap rules without touching referral money.

The two are structurally parallel by design: `rewardTransactions` mirrors
`walletTransactions`' append-only shape, and reservation/settle/refund follow
the same guarded-update pattern. Both balances can apply to one order.

## Data model

**`users`** gains three fields:

```
rewardPoints: number       // spendable balance, integer, 1 point = ₹1
streakCount: number        // current consecutive active-day count
streakLastDate: string     // IST calendar date "yyyy-mm-dd" of the last streak-advancing paid order
```

**`rewardTransactions`** — new append-only collection:

```
{
  userId: ObjectId,
  orderId: ObjectId,
  type: "earned" | "reserved" | "spent" | "refunded" | "reversed",
  amount: number,          // always positive; `type` carries the direction
  rate?: number,           // the % used, on `earned` rows
  streakAfter?: number,    // streak value after the order, on `earned` rows
  createdAt: Date,
}
```

**`settings`** — new document:

```
{ key: "streakExemptDates", dates: ["2026-08-15", ...], updatedAt: Date }
```

Dates are IST calendar dates. They are skipped by the streak calculation
exactly like weekends, so an admin can close the kitchen on a weekday without
resetting every streak in the system.

**`orders`** gains four fields:

```
rewardBase: number         // server-computed pre-tax total, frozen at creation
pointsApplied: number      // points reserved/redeemed against this order
pointsEarned: number       // points credited when the order was paid
pointsRate: number         // the % rate used, for the bill and receipt
streakAfter: number        // streak value this order produced
```

## The rules: `src/lib/rewards.ts`

A new client-safe pure module (no DB import), sitting alongside
`walletMath.ts`, so checkout can preview the same maths the server later
enforces. Following the `ist.ts` convention, **no function here reads the
clock** — callers inject `today`.

```ts
export const POINT_RATES = [10, 12, 14, 16, 18, 20]; // %, indexed by streak day
export const MAX_POINT_RATE = 20;

/** Streak day N → earn rate. Day 6 and beyond all earn the 20% cap. */
export function rateForStreak(streak: number): number;

/** Is this IST calendar date exempt — Saturday, Sunday, or an admin holiday? */
export function isExemptDay(date: string, exemptDates: Set<string>): boolean;

/** The streak value an order placed on `today` produces. */
export function nextStreak(
  prev: { count: number; lastDate: string } | null,
  today: string,
  exemptDates: Set<string>,
): number;

/** Points earned for a pre-tax base at a given rate (rounded to a whole point). */
export function computePointsEarned(rewardBase: number, rate: number): number;

/**
 * How many points to apply to a payable, capped so at least MIN_PAYABLE
 * remains after wallet credit has already been applied.
 */
export function computePointsApplied(
  balance: number,
  payableAfterWallet: number,
): { pointsApplied: number; amountPayable: number };
```

`rateForStreak` clamps: `POINT_RATES[Math.min(streak, 6) - 1]`, so streak 1 →
10% and any streak of 6 or more → 20%.

### `nextStreak` branches

| Situation | Result |
| --- | --- |
| `prev` is null — first ever order | `1` |
| `prev.lastDate === today` — already ordered today | `prev.count` (unchanged) |
| every day strictly between `lastDate` and `today` is exempt | `prev.count + 1` |
| a non-exempt day was missed | `1` |

Implemented with `addIstDays` / `istDaysBetween` / `istWeekday` from `ist.ts`.

### Consequence: weekends are pure upside

Weekend days are exempt *gaps*, not blocked days. A Saturday order therefore
still advances the streak (`Fri → Sat` has no intervening days, so it is a
`+1`), while skipping the weekend is also a `+1` (`Fri → Mon` has only Sat and
Sun between, both exempt). Order and you climb; skip and you are held harmless.

### Worked example

```
Mon  order #1  → 10%   streak 1
Tue  order #2  → 12%   streak 2
Tue  order #3  → 12%   (same day, no advance)
Wed  order #4  → 14%   streak 3
Thu  — no order →      streak breaks
Fri  order #5  → 10%   streak 1
Sat  — no order →      streak 1 (exempt)
Sun  — no order →      streak 1 (exempt)
Mon  order #6  → 12%   streak 2
```

## The earn base

Points are earned on the **pre-tax bill after discounts** — in checkout terms,
`discountedSubtotal` (`src/app/order/page.tsx:488`): item subtotal, less the
offer discount (coupon *or* first-order 20%, whichever wins) and the location
discount, before GST and before the delivery fee.

This figure must not come from the client. `src/app/api/orders/route.ts:305`
already computes `minAcceptable` — the server's floor for the pre-tax total,
recomputed from the DB across every discount the order legitimately qualifies
for. That is exactly the value needed, so it is frozen onto the order as
`rewardBase` at creation.

It is conservative by construction: `minAcceptable` can only ever sit at or
below the true pre-tax total (it assumes the largest discount the customer was
entitled to), so a tampered client cannot inflate points. In practice the two
are equal, because the client always applies the first-order discount when
eligible and coupon allowances are only computed for a coupon actually
submitted.

Redeeming points does **not** shrink the earn base — points are consideration,
not a discount, so the customer still earns on the full pre-tax total.

## Earning: hooked into the paid-once block

`reconcilePayment` (`src/lib/reconcilePayment.ts:316`) guards its side effects
on the "not already paid" transition, so exactly one caller — the client
`verify-order` or the Razorpay webhook, whichever wins the race — runs them.
Points are awarded there, alongside `settleWallet` and `creditReferral`:

```
awardRewardPoints(db, userId, orderId):
  1. read order.rewardBase and the user's { streakCount, streakLastDate }
  2. read the streakExemptDates settings doc
  3. streakAfter = nextStreak(prev, istToday(now), exemptDates)
     rate       = rateForStreak(streakAfter)
     points     = computePointsEarned(rewardBase, rate)
  4. guarded update on users:
       filter { _id: userId, streakLastDate: { $ne: today } }
       $set   { streakCount: streakAfter, streakLastDate: today }
       $inc   { rewardPoints: points }
     If the filter does not match, the streak was already advanced today —
     credit the points with a plain $inc but leave the streak untouched.
  5. insert an `earned` ledger row { amount: points, rate, streakAfter }
  6. stamp pointsEarned / pointsRate / streakAfter onto the order
```

Step 4's filter is what makes a same-day second order safe under concurrency:
two orders paid simultaneously cannot both advance the streak.

Because the whole function runs only inside `didTransition`, a verify/webhook
race or a Razorpay webhook retry can never double-credit.

## Redeeming: mirrors the wallet reservation

In the orders POST, immediately after the existing wallet reservation
(`src/app/api/orders/route.ts:395`), points are applied to whatever payable
remains:

```
reserveRewardPoints(db, userId, orderId, amount):
  updateOne({ _id: userId, rewardPoints: { $gte: amount } },
            { $inc: { rewardPoints: -amount } })
  → false if it did not match (balance moved underneath); reserves nothing
  → on success, insert a `reserved` ledger row
```

The `$gte` guard is the double-spend defence, identical to `reserveWallet`.

Ordering is **wallet first, then points**, which leaves the existing, tested
wallet path unchanged. Neither balance expires in v1, so the order carries no
cost to the customer.

Both together respect the shared `MIN_PAYABLE = 1` from `walletMath.ts`:
Razorpay cannot charge ₹0, so at least ₹1 always remains payable.
`computePointsApplied` takes the post-wallet payable precisely so this cap is
applied once, over the combined redemption.

Redemption is a single on/off toggle in the UI, matching the wallet's — there is
no partial-amount slider. When on, it spends as much of the balance as the bill
allows; the remainder stays banked. The client signals opt-out with
`useRewardPoints: false` in the create-order body, the same way `useWallet`
works today, and redemption defaults to on when the field is absent.

À-la-carte checkout is Razorpay-only (`src/app/order/page.tsx:109`), so there is
no COD case to handle here — every redeeming order reaches the reconcile settle
path.

Settlement at payment is a `spent` ledger row inside the same `didTransition`
block — the balance was already decremented at reserve time, exactly as
`settleWallet` works.

## Unwinding

Three ways an order can die, each following the wallet's existing handling:

1. **Checkout abandoned.** `refundReservationForOrder` and
   `sweepStaleOrderReservations` (30-minute cutoff) extend to restore
   `pointsApplied`, zeroed in the same guarded update so a retry is a no-op.
2. **Payment failed.** Same path, already wired through `fail-order`.
3. **Admin rejects and refunds a paid order**
   (`src/app/api/admin/orders/route.ts:247`). Restore the points spent, and
   reverse the points earned with a `reversed` ledger row. The reversal is
   clamped so the balance cannot go negative if those points have already been
   spent on another order.

**A refunded order keeps its streak day.** The order was genuinely placed, and
rejections are usually the kitchen's call — clawing back a streak for the
shop's own stock-out is how you lose a daily customer.

## Read endpoint

`GET /api/rewards/me` — authenticated via the customer session cookie, mirroring
`/api/wallet/balance`:

```json
{ "points": 200, "streak": 3, "nextStreak": 4, "nextRate": 16 }
```

`nextStreak` / `nextRate` are what an order placed *right now* would produce, so
checkout can show the rate before payment. This is display only; the
authoritative values are always recomputed server-side at payment.

## Customer-facing UI

**Checkout** (`src/app/order/page.tsx`, the bill block around line 819 where the
wallet toggle lives):

```
Item total                    ₹500
Location discount (10%)       −₹50
GST (5%)                       ₹23
Delivery                       ₹20
─────────────────────────────────
🔥 Day 3 streak · earning 14%
   You'll earn 63 points on this order
─────────────────────────────────
☑ Use reward points (200)     −₹200
Wallet credit                   —
─────────────────────────────────
Pay now                       ₹293
```

The streak line is both the reward and the nudge: a customer on day 3 can see
that tomorrow is worth 16% and that skipping a working day drops them to 10%.

**Success screen** confirms what was banked — streak day, points earned, new
balance — with the celebratory treatment used for the location-discount modal
(commit `15f6714`). This is where the mechanic teaches itself.

**Order history (`/orders`)** carries the standing display: current points,
current streak, and the six-rung ladder with the current rung marked.

**`/refer`** is unchanged and keeps showing wallet credit alone. The two
balances stay visually distinct — the reason for the separate ledger.

## Admin UI

- **Store Hours page** gains the streak-exempt dates editor (antd `DatePicker`,
  consistent with the rest of admin). It belongs on the screen that already
  answers "when are we open".
- **Users list** gains a reward-points column.

## Testing

`src/lib/rewards.test.ts` under vitest — pure functions only, no DB, no clock:

- the ladder: streak 1 → 10%, 2 → 12%, 3 → 14%, 4 → 16%, 5 → 18%, 6 → 20%
- the cap: streak 7 and streak 20 both stay at 20%
- same-day second order holds the rate and does not advance the streak
- `Fri → Mon` advances (weekend gap forgiven)
- `Fri → Tue` resets (Monday missed)
- `Fri → Sat` advances (weekend orders count for you)
- an admin holiday on a Wednesday: `Tue → Thu` advances
- chained exempt days: holiday-Friday → Monday advances
- first-ever order → streak 1 → 10%
- `computePointsEarned` rounding at the half-point boundary
- `computePointsApplied`: wallet + points never drop payable below `MIN_PAYABLE`
- a zero or negative `rewardBase` earns nothing

The DB-touching functions (`reserveRewardPoints`, `awardRewardPoints`,
`settleRewardPoints`) follow `wallet.ts`, which has no unit tests today — its
guarantees are guarded-update-shaped rather than logic-shaped, and are exercised
through the order flow. This feature matches that convention rather than
introducing a mocking layer for one module.

No Playwright verification, per the project's standing preference.
