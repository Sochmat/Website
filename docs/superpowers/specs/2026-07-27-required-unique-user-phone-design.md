# Required, unique user phone

**Date:** 2026-07-27
**Status:** Approved, ready for planning

## Problem

`users.phone` exists in the schema (`src/lib/types.ts:200`) but has no input surface. Login and
registration are email-only (`LoginPopup.tsx:30`, `register/page.tsx:8`), Google signup hardcodes
`phone: ""` (`api/users/google/route.ts:80`), and `PATCH /api/users` excludes phone from its
allow-list (`api/users/route.ts:137`). So `user.phone` is empty for essentially every real account
and can never be filled in.

Two consequences:

1. **Offer abuse.** The one-time offers gate on `userId` — the 20% first-order discount
   (`orderEligibility.ts:14`) and the ₹200 referral credit (`wallet.ts:91`). One person can register
   unlimited email addresses and collect the offer once per address. Nothing ties those accounts
   together.
2. **Checkout friction.** The only phone anyone types is the *receiver's* at checkout
   (`DeliveryDetailsSheet.tsx:287`), and it can't be prefilled from the account because the account
   has no phone.

## Goal

Every account carries exactly one phone number, and no two accounts share one. That makes the phone
the identity that one-time offers are rationed against, and gives checkout something real to
prefill the receiver field with.

Preventing repeat claims of one-time offers is the primary driver. Where a design choice trades
convenience against that goal, the goal wins.

## Non-goals

- Phone-based login. The phone-OTP endpoints still exist server-side but no client calls them; this
  spec does not revive them.
- A self-serve "change my number" screen. Phone stays off the `PATCH /api/users` allow-list.
- SMS verification of the phone. See "Decisions" below.
- Deduplicating accounts that are already phoneless duplicates of each other.

## Decisions

| Question | Decision |
|---|---|
| Phone verified by SMS OTP? | No. Typed and validated only, persisted after the **email** OTP verifies. One OTP, no Kaleyra cost. |
| Collision with an existing phone-holding doc | Claim it if it has no `email` and no `googleId`; otherwise reject. |
| Google signups | Same required phone step, after the Google credential is accepted. |
| Existing phoneless accounts | Not blocked from ordering. Backfilled opportunistically at checkout, and denied one-time offers until they have a phone. |
| Checkout prefill precedence | Account phone first. |

## Design

### 1. Normalization and the uniqueness constraint

New `src/lib/phone.ts`:

```ts
/** A 10-digit Indian mobile number, or null if the input isn't one. */
export function normalizePhone(raw: unknown): string | null
```

Strips every non-digit, drops a leading `91` or `0` if what remains is still 10 digits, and returns
the 10-digit string — or `null`. Every write path calls it, so `+91 98765 43210`, `098765 43210` and
`9876543210` cannot become three separate "unique" rows.

Partial unique index on `users.phone`, created lazily behind a cached promise in the style of
`referral.ts:29-40`:

```ts
db.collection("users").createIndex(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } },
);
```

The partial filter is what makes this deployable against live data: today's docs with `phone: ""` or
no `phone` field fall outside the filter, so index creation succeeds and legacy accounts are not
retroactively invalidated. A plain `unique: true` — even with `sparse: true` — would fail on the
existing pile of `phone: ""` docs.

Going forward, no code path writes `phone: ""`. Absent means absent.

### 2. Registration

**UI.** `register/page.tsx` and `LoginPopup.tsx` gain a required phone field beside name and email:
`type="tel"`, `inputMode="numeric"`, `maxLength={10}`, `onChange` stripping non-digits, submit
disabled below 10 digits. Matches the existing `DeliveryDetailsSheet.tsx:287` treatment.

In `LoginPopup` the field is rendered only under `mode === "register"`, alongside the existing
name and referral fields (`LoginPopup.tsx:290`, `:320`). **The login path is untouched.** Login
posts to `/api/users/otp/send` (`LoginPopup.tsx:88`), which this spec does not modify — a legacy
account with no phone signs in exactly as it does today and is never blocked at the door. It
acquires a phone through the checkout backfill (§5), not through login.

**`POST /api/users/otp/register`.** Requires a phone on every request. Normalizes it, then
pre-checks:

```ts
const holder = await db.collection("users").findOne({ phone });
```

If `holder` exists, has an `email` or `googleId`, and is not the account being registered → `409`,
message *"This phone number is already registered with another account."* Rejecting here, before the
OTP is sent, means the user learns immediately rather than after a round trip.

The pre-check is skipped when the email already resolves to an account that has a phone — that
request keeps its stored number regardless of what was typed, per the guard in §3.

**The phone is not written to the user doc at this stage.** It is stored as `pendingPhone` on the
`otps` doc alongside the code. This is the fix for the squatting hole: today the route inserts the
user at OTP-send time (`otp/register/route.ts:41-58`), so writing the phone there would let anyone
permanently burn any number by starting a registration they never finish.

**`POST /api/users/otp/verify`.** After the code checks out, reads `pendingPhone`, runs the claim
step (§3), and writes the phone to the user doc. Wraps the write so a `code === 11000` duplicate-key
error — the race where two registrations verify the same number at once — surfaces as the same `409`
rather than a 500.

### 3. Claiming a shadow account

The `users` collection already contains docs keyed on a *receiver's* phone, auto-created at checkout
by `api/orders/route.ts:151`. They have a phone and nothing else. A real person registering with
their own number will collide with one whenever someone has previously had food delivered to them.

Given normalized phone `P` and the email account `E` being verified.

First, a guard that precedes the matrix: **if `E` already has a non-empty phone, `P` is ignored
entirely.** `otp/register` is reachable for an email that already exists (`otp/register/route.ts:36`
updates rather than inserts), so without this guard, re-registering with a different number would be
an unguarded "change my number" path — explicitly a non-goal. The stored phone wins silently; no
error is raised, because from the user's point of view they simply logged back in.

Otherwise:

| Holder of `P` | Action |
|---|---|
| nobody | set `phone: P` on `E` |
| `E` itself | no-op |
| doc with no `email` and no `googleId` | merge (below), then set `phone: P` on `E` |
| doc with an `email` or `googleId` | `409`, registration blocked |

**Merge.** `E` is canonical — it holds the session identity and the referral attribution. The shadow
is drained into it:

- `updateMany({ userId: shadowId }, { $set: { userId: E._id } })` across `orders`, `subscriptions`,
  `subscriptionMealPlans`, `walletTransactions`
- `updateMany({ referredBy: shadowId }, { $set: { referredBy: E._id } })` on `users`
- copy `addresses` from the shadow if `E` has none
- `deleteOne({ _id: shadowId })`
- only then set `phone: P` on `E`

The delete must precede the set or the unique index rejects the write. There is no transaction here;
the ordering is chosen so the failure modes are benign — a crash mid-merge leaves data repointed at
`E` with the shadow still holding the phone, which the next attempt re-runs idempotently.

**In practice the merge moves almost nothing.** `api/orders/route.ts:181` stores orders under
`sessionUserId ?? user._id`, so an order placed by a signed-in user is attributed to *that user*, not
to the shadow created from the receiver phone. Today's shadows are inert husks. The repointing exists
for pre-session legacy orders and to keep the operation correct rather than merely usually-harmless.

A useful side effect: because merging carries the shadow's paid orders onto `E`,
`isEligibleForFirstOrderDiscount` correctly reports `false` for anyone claiming an account that has
already ordered.

### 4. Google signup and the phone-capture endpoint

`api/users/google/route.ts` stops writing `phone: ""` on insert — the field is omitted, keeping the
doc outside the partial index. The response gains `needsPhone: boolean`, true whenever the resolved
user has no phone (new signup or a pre-existing phoneless account).

When `needsPhone` is true the client shows the same required phone step before letting the user
proceed, posting to:

**`POST /api/users/phone`** — sets the phone on the session user (`getCustomerUserId`, never a body
`userId`). Normalizes, runs the identical §3 claim logic, returns `409` on a collision with an owned
account. Rate-limited via `limiters.auth` so it can't be used to enumerate which numbers are taken.

This endpoint is deliberately separate from `PATCH /api/users`: the generic patch route has no
collision handling, and phone stays off its allow-list (`api/users/route.ts:137`).

### 5. Checkout

**Shadow creation is removed.** The block at `api/orders/route.ts:118-166` — which looks up or
creates a user from `body.receiver.phone` — is deleted. `orderUserId` becomes the session user id
outright. This is safe because the order page is auth-gated (`order/page.tsx:96-99`, `:302-304`,
`:1007`): there are no reachable guest orders. The route returns `401` if there is no session.
`api/subscriptions/route.ts:25-73` gets the same treatment.

While there, the misleading `"user.phone is required"` message (`api/orders/route.ts:123`,
`api/subscriptions/route.ts:30`) becomes `"receiver.phone is required"` — it validates
`body.receiver.phone`, not a user field.

**Opportunistic backfill.** If the session user has no phone, the route adopts the normalized
receiver phone for their account — but **only when nobody holds it at all**. Unlike the registration
claim in §3 it never absorbs a shadow: at registration the number is asserted to be yours, whereas
at checkout it is the *receiver's*, and a phoneless user ordering for a friend must not end up
owning the friend's number. Best-effort throughout; an order never fails because of this.

`otp/send` (the login path) clears any `pendingPhone` left on the `otps` document by an abandoned
registration. Without that, a stale pending number would be claimed on a later *login* — and if it
had since been taken, the 409 would block the login itself.

**Prefill.** `order/page.tsx:1041` flips to account-first and switches `??` to `||`, so an empty
string falls through instead of winning:

```tsx
defaultPhone={user?.phone || savedDeliveryDetails?.phone || selectedAddress?.receiverPhone || ""}
```

`defaultName` at `:1035` gets the same `||` fix, as does `AddAddressSheet.tsx:54`. The field stays
editable — ordering for someone else is one edit away, and `sochmat_delivery_details` still caches
the last receiver as a second-choice fallback.

### 6. Gating the one-time offers on phone presence

Uniqueness only rations offers among accounts that *have* a phone. Pre-existing phoneless accounts
would otherwise keep collecting them, which is the loophole this whole change exists to close.

- `isEligibleForFirstOrderDiscount` (`orderEligibility.ts:14`) returns `false` when the user has no
  non-empty `phone`. Requires a `users` lookup, which the function does not currently do.
- `creditReferral` (`wallet.ts:91`) returns early when the referee has no phone. Its existing
  projection at `:99` widens to include `phone`, and the guard at `:101` extends.

Neither blocks ordering — only the offer. A legacy user's next checkout backfills their phone (§5),
and the offer becomes available on the order after that. The `referralCredited` flag is *not* set
when credit is withheld for a missing phone, so the credit is still payable once they have one.

`api/orders/first-order-eligibility/route.ts:23` needs no change; it delegates to the same function.

## Error handling

| Condition | Response |
|---|---|
| Phone missing or not 10 digits | `400` before the OTP is sent |
| Phone owned by an account with email/googleId | `409`, *"This phone number is already registered with another account."* |
| Duplicate-key (11000) on the phone write | `409`, same message — the concurrent-verify race |
| No session on `POST /api/users/phone` | `401` |
| Backfill collision at checkout | Silent; order proceeds without a phone on the account |

The 409 message is deliberately identical in every case and does not reveal *which* account holds the
number.

## Testing

Unit:

- `normalizePhone` — bare 10 digits, `+91` prefix, leading `0`, spaces and dashes, too short, too
  long, non-numeric, `null`/`undefined`.
- `isEligibleForFirstOrderDiscount` — returns false for a phoneless user even with no prior orders.
- `creditReferral` — no-ops for a phoneless referee and leaves `referralCredited` unset, so the
  credit survives to be paid after backfill.

Integration, against the claim matrix:

- phone free → written on verify
- phone held by an email-less shadow → merged, shadow deleted, `orders.userId` repointed, phone set
- phone held by an account with an email → `409`, and the registrant's account keeps no phone
- registration abandoned after OTP send → the phone remains claimable by someone else
- re-registering an email that already has a phone, typing a different number → stored phone
  unchanged, no error, and the typed number is not claimed
- two registrations verifying the same phone concurrently → one succeeds, the other gets `409`
- checkout by a phoneless session user → phone backfilled onto the account
- checkout where the receiver phone belongs to someone else → order succeeds, no backfill

## Rollout

The partial index tolerates existing data, so this deploys without a migration. Legacy phoneless
accounts drain naturally as their owners check out. No backfill script is needed; if one is wanted
later to compact the shadow docs, it is independent of this change.
