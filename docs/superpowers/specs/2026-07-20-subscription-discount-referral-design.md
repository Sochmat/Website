# First-Subscription Discount + Referral Wallet — Design

**Date:** 2026-07-20
**Branch:** subscription-weekly-builder
**Status:** Approved for planning

## Summary

Two features for the subscription (meal-plan / credits) system, sharing one new
primitive — a per-user **wallet**:

1. **First-subscription discount** — 20% off a customer's very first paid
   subscription plan. Auto-applied, no code.
2. **Referral** — every user gets a shareable referral code/link. When a
   referred friend pays for their first subscription, the referrer earns **₹200**
   of wallet credit, which auto-reduces the total on the referrer's future
   subscription purchases. The two discounts **stack** on the same purchase.

Both are money, so everything is computed and persisted **server-side**. The
client-supplied amount is never trusted — plan pricing is read from Mongo and the
Razorpay payment is re-verified against the server's `amountPayable`.

## Context (existing architecture)

- Single Next.js 16 App Router project (`sochmat-web`); the subscription app is
  the same codebase served on the `subscription.` subdomain. MongoDB via the
  native driver (DB `Sochmat`); no ORM — "schemas" are TS interfaces in
  `src/lib/types.ts`.
- **Users** are phone-keyed (`users` collection), OTP auth, identity via an
  HMAC-signed `user_session` cookie. Route handlers derive identity with
  `getCustomerUserId(request)` (`src/lib/customerSession.ts`) and ignore any
  client-supplied userId.
- **Plan pricing** is authoritative in `computeBracketPlanTotals`
  (`src/lib/subscriptionBrackets.ts:48`): `subtotal = pricePerMeal × 7`,
  `tax = round(subtotal × GST_RATE)` (GST 5%, `src/lib/subscription.ts`),
  `totalAmount = subtotal + tax`.
- **Plan lifecycle:** `POST /api/subscriptions/plans` creates a `pending` plan
  with frozen totals → Razorpay → `POST /api/subscriptions/plans/verify` is the
  ONLY `pending → paid` path; it fetches the real payment and requires
  `payment.amount === round(plan.totalAmount × 100)`, then anchors the 30-day
  `expiresOn`.
- Subscription checkout (`src/helpers/razorpay.ts`) passes `failUrl: null` — plans
  currently have nothing to mark on payment failure.
- An existing **coupon** system exists but only for à-la-carte `orders`; there is
  **no discount/wallet path for subscription plans** and no referral logic
  anywhere today.

## Data model changes (`src/lib/types.ts`)

### `User` — new fields
| Field | Type | Notes |
|---|---|---|
| `referralCode` | `string` | Unique short code, e.g. `SM4K9T`. Generated lazily (see below). |
| `referredBy` | `ObjectId \| string` (optional) | The referrer's userId. Set **once**, only at registration, only if a valid `ref` code was supplied and it isn't the user's own code. |
| `referralCredited` | `boolean` (optional) | Guard: the referrer for this user has already been paid. Prevents double credit. |
| `walletBalance` | `number` | Integer ₹ available balance. Defaults to 0 (treat missing as 0). |

### New collection `walletTransactions` (audit ledger)
```
{
  _id, userId,
  type: 'referral_earned' | 'reserved' | 'spent' | 'refunded',
  amount: number,            // ₹, always positive; `type` gives direction
  planId?: ObjectId,         // for reserved/spent/refunded
  refereeUserId?: ObjectId,  // for referral_earned
  createdAt: Date
}
```
`walletBalance` is the fast-read value; the ledger is the source of truth for
support/debugging and must always be written in the same operation that moves the
balance.

### `SubscriptionMealPlan` — new fields
| Field | Type | Notes |
|---|---|---|
| `firstPlanDiscount` | `number` | ₹ removed by the 20% first-plan discount (0 if not first). |
| `walletApplied` | `number` | ₹ of wallet reserved against this plan (0 if none). |
| `amountPayable` | `number` | `= totalAmount − walletApplied`. What Razorpay actually charges and what verify matches against. |

`totalAmount` keeps meaning "plan price after the first-plan discount, incl. GST"
(gross of wallet). `amountPayable` is net of wallet.

## Feature 1 — First-subscription 20% discount

**Constant:** `FIRST_PLAN_DISCOUNT_RATE = 0.20` (hardcoded, in
`subscriptionBrackets.ts` or a small `subscriptionDiscount.ts` helper).

**"First" definition:** the user has **zero** `subscriptionMealPlans` with
`paymentStatus: "paid"`. Legacy `subscriptions` collection is ignored.

**Where:** `POST /api/subscriptions/plans` (`src/app/api/subscriptions/plans/route.ts`),
after `computeBracketPlanTotals`:
1. Query for a prior paid plan for `userId`. If none → this is the first plan.
2. Apply 20% to the **subtotal**, then recompute tax on the discounted subtotal:
   - `discountedSubtotal = round(subtotal × 0.80)`
   - `tax = round(discountedSubtotal × GST_RATE)`
   - `totalAmount = discountedSubtotal + tax`
   - `firstPlanDiscount = (subtotal + originalTax) − totalAmount`
3. Persist the discounted `totalAmount` and `firstPlanDiscount` on the plan.

Because verify matches the persisted `totalAmount`/`amountPayable`, no verify
change is needed for the discount itself.

**Preview endpoint:** the checkout UI needs to show the discounted price before a
plan is created. Add a read-only pricing preview — either extend the bracket/plans
GET responses or a small `GET /api/subscriptions/plans/quote?bracket=&diet=` that
returns `{ totalAmount, firstPlanDiscount, walletBalance, walletApplied,
amountPayable }` for the signed-in user. The authoritative recompute still happens
at plan creation; the quote is display-only.

## Feature 2 — Wallet redemption (stacks with the discount)

**Constant:** `MIN_PAYABLE = 1` (₹). Razorpay cannot charge ₹0, so wallet is
capped to always leave at least ₹1 payable. (₹200 wallet vs typical ₹500+ plans
means full coverage is rare; the cap keeps one uniform pay/verify flow.)

**Reserve at creation** — in `POST /api/subscriptions/plans`, after the discount:
1. Read the user's `walletBalance`.
2. `walletApplied = min(walletBalance, totalAmount − MIN_PAYABLE)` (floored at 0).
3. `amountPayable = totalAmount − walletApplied`.
4. **Atomically** decrement the balance, guarded on sufficiency:
   `updateOne({ _id: userId, walletBalance: { $gte: walletApplied } },
   { $inc: { walletBalance: -walletApplied } })`. If `matchedCount === 0`
   (balance changed underneath us), re-read and recompute or set `walletApplied = 0`.
   Write a `reserved` ledger entry with `planId`.
5. Persist `walletApplied` and `amountPayable` on the plan.

This prevents both losing balance on abandoned checkouts and double-spend across
concurrent plans.

**Charge & verify the net amount:**
- The subscription checkout uses `amountPayable` (not `totalAmount`) as the
  Razorpay `amount`.
- `POST /api/subscriptions/plans/verify` matches
  `payment.amount === round(plan.amountPayable × 100)` (changed from
  `totalAmount`). For a plan with no wallet, `amountPayable === totalAmount`, so
  existing behaviour is unchanged.

**Settle on pay:** in verify, on the guarded `pending → paid` transition, if
`walletApplied > 0`, flip the plan's `reserved` ledger entry to `spent` (do NOT
touch `walletBalance` again — it was already decremented at reservation). This is
part of the same guaranteed-once activation, so it runs at most once.

**Refund on abandon/fail** — reserved wallet must return to the balance if the
plan never gets paid. Two mechanisms:
1. **Explicit (primary):** new `POST /api/subscriptions/plans/[planId]/fail` (or
   `/cancel`), auth'd + ownership-checked, guarded on `paymentStatus: "pending"`.
   Refunds `walletApplied` to `walletBalance`, writes a `refunded` ledger entry,
   and zeroes `walletApplied`/resets `amountPayable`. The subscription checkout
   sets its `failUrl`/onError + modal-dismiss handler to call this instead of the
   current `failUrl: null`.
2. **Safety-net sweep:** the client fail-call is best-effort (browser may close).
   A lazy sweep refunds reservations for `pending` plans older than a threshold
   (e.g. 30 min). Implement as a guarded read-time sweep (mirroring the existing
   lazy credit-expiry pattern in `plans` GET) or a small maintenance query; each
   plan is refunded at most once (guard on `walletApplied > 0` + `pending`, and
   flip a marker so it isn't refunded twice).

Both refund paths must be idempotent: only refund a plan whose `walletApplied > 0`
and `paymentStatus === "pending"`, and zero `walletApplied` in the same guarded
update so a second call is a no-op.

## Feature 2 — Referral crediting

**Referral code generation (lazy):** a user gets a `referralCode` the first time
it's needed — on registration and when they open the Refer & Earn page. Generate a
short uppercase alphanumeric code (e.g. `SM` + 4 random base36 chars), retry on
the rare uniqueness collision (unique index on `users.referralCode`), and store it
on the user.

**Capture (`referredBy`)** — in `POST /api/users/otp/register/route.ts`:
- Accept an optional `ref` in the body (the storefront reads `?ref=CODE` from the
  URL and forwards it).
- Only when **creating a new user**: look up the referrer by `referralCode`. If
  found and it isn't the same account, set `referredBy = referrer._id` on the new
  user. Never overwrite an existing user's `referredBy`, and a user can never
  refer themselves.

**Earn (₹200 to the referrer)** — in `POST /api/subscriptions/plans/verify`, at
the guaranteed-once `pending → paid` activation:
- Conditions: this is the referee's **first** paid plan AND `referredBy` is set
  AND `referralCredited` is falsy.
- Action, guarded for idempotency: atomically set the referee's
  `referralCredited: true` (`updateOne({ _id: refereeId, referralCredited: { $ne: true } }, …)`);
  only if that update matched, `$inc` the referrer's `walletBalance` by 200 and
  write a `referral_earned` ledger entry (`refereeUserId`, `amount: 200`).
- `REFERRAL_REWARD = 200` constant. No cap on number of referrals in v1.

## UI surfaces

- **Subscription checkout / bracket cards** (`src/app/subscription/page.tsx`):
  show "20% off your first plan" on the first-plan price and a "−₹X wallet
  applied" line + resulting `amountPayable` in the order summary. Values come from
  the quote endpoint / server-returned plan, never computed for money on the
  client.
- **Refer & Earn page** (new, on the subscription subdomain): the user's referral
  code + copyable share link (`https://subscription.sochmat.com/?ref=CODE`),
  current wallet balance, and simple referral history (friends joined / ₹ earned),
  read from `walletTransactions`. Requires a signed-in customer.
- **Admin (light):** show `walletBalance` (read-only) on the existing admin users
  page. Full referral admin tooling is out of scope for v1.

## Edge cases & decisions

- **Full wallet coverage:** capped by `MIN_PAYABLE = ₹1`; a plan always has a
  non-zero Razorpay charge. No zero-amount payment path is built.
- **Discount + wallet stack:** discount is applied first (reduces `totalAmount`),
  then wallet reserves against the discounted total.
- **Abandoned checkout:** reserved wallet is refunded via the explicit fail route
  and/or the stale-pending sweep; never silently lost.
- **Referrer buys before referring:** they can still refer afterwards and earn
  wallet for later purchases — earning is independent of their own purchase state.
- **Self-referral / re-referral:** blocked at capture (own code rejected,
  existing `referredBy` never overwritten).
- **Idempotency:** every balance-moving operation (reserve, settle, refund,
  referral credit) is a guarded `updateOne` that matches at most once, paired with
  a ledger write.

## Out of scope (v1)

- Friend-side referral reward (friend gets only the 20% first-plan discount).
- Cash/UPI payout of wallet balance (wallet only offsets subscription purchases).
- Referral caps, expiry of wallet balance, admin referral management UI.
- Applying wallet/discounts to à-la-carte `orders` or the legacy `subscriptions`
  flow.

## Implementation sequence (for the plan)

1. Types + constants + `walletTransactions`/unique-index groundwork.
2. First-subscription discount in `plans` POST + quote endpoint + card/summary UI.
3. Wallet reserve/settle/refund: `plans` POST, verify, fail route, sweep; checkout
   uses `amountPayable`; summary UI.
4. Referral: lazy code generation, capture at register, earn at verify, Refer &
   Earn page.
5. Admin read-only wallet display.
