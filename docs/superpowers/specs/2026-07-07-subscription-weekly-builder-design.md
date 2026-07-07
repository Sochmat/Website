# Sochmat Subscription — Weekly Menu Builder

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan

## Summary

A new customer-facing subscription flow served at `subscription.sochmat.com` where a
logged-in user builds a **7-day plan, one item per day**, by dragging items from a
curated lot of subscription-eligible menu items onto day cards. The price is the
**sum of each picked item's flat `subscriptionPrice`**. The **total weekly protein**
(and kcal) is shown as a live, informational tally — it does not gate or set the
price. The plan covers **one upcoming week**, days can be **skipped**, payment is a
**one-time** charge (no auto-renew).

## Decisions locked during brainstorming

- **Pricing:** flat per item. Each eligible item has its own `subscriptionPrice`.
  Week total = sum of `subscriptionPrice` of every item picked across the days.
- **Protein role:** live running total only. Informational, no enforcement.
- **Day structure:** exactly one item per day. 7 day slots. Assigning replaces the
  day's item.
- **Scheduling:** one upcoming week starting from a user-chosen start date; the 7
  days are start_date … start_date+6. Any day can be left empty (no delivery/charge).
  One-time payment, no auto-renew.
- **Serving:** middleware host-rewrite within the existing single Next.js app/deploy.
- **Delivery:** one address + one daily delivery time applied to all days. Reuses the
  existing address sheets and 10km service-area check.
- **Auth:** login required to checkout (browse/build allowed logged-out; must log in
  before payment). Uses the existing `UserContext` + `LoginPopup` phone flow.
- **Eligibility:** an item shows in the builder iff `isAvailableForSubscription === true`
  **and** it has a `subscriptionPrice > 0`.
- **Admin:** view list + per-day delivery breakdown (drives kitchen + delivery).
- **Drag-and-drop:** add the `@dnd-kit` library (touch/pointer sensors); tap-to-assign
  fallback.

## Architecture & routing

- Served from the **same Next.js app and deployment**. `src/middleware.ts` detects a
  request `Host` header beginning with `subscription.` and **rewrites** `/*` → the new
  `/subscription/*` route group. No separate deploy, same MongoDB, and the new pages
  inherit the root layout's providers (`UserProvider`, `LoginPopupProvider`,
  `CartProvider`, `StoreStatusProvider`, `LocationProvider`).
- On the subscription host, block access to the `/admin` surface (admin is reached
  only on the primary host). Existing global rate-limiting is unchanged.
- New route group: `src/app/subscription/` containing at least:
  - `page.tsx` — the weekly builder + checkout.
  - `success/page.tsx` — post-payment confirmation.
  - `orders/page.tsx` — the user's purchased weekly plans (mirrors `/orders`).

### Middleware host detection

- Read the host from `request.headers.get("host")` (fallback `request.nextUrl.host`).
- If it starts with `subscription.` and the pathname is not already under
  `/subscription` and not an API/`_next` asset, `NextResponse.rewrite` to
  `/subscription` + pathname.
- Keep the existing admin-auth and rate-limit logic intact and ordered before/after
  as appropriate. API routes (`/api/*`) are shared and are **not** rewritten.

## Data model

### MenuItem (extend existing `src/lib/types.ts`)

Add:

```ts
/** Flat price charged per delivery of this item inside a weekly subscription plan.
 *  Item is offered in the subscription builder only when this is > 0 AND
 *  isAvailableForSubscription is true. */
subscriptionPrice?: number;
```

- `GET /api/menu` must include `subscriptionPrice` in each formatted item
  (`item.subscriptionPrice ?? 0`), alongside the existing `isAvailableForSubscription`.

### New collection: `subscriptionPlans`

Kept **separate** from the legacy single-item `subscriptions` collection so the two
flows never mix.

```ts
interface SubscriptionPlanDay {
  date: string;          // ISO yyyy-mm-dd
  weekday: string;       // e.g. "Monday"
  productId: string;
  itemName: string;      // snapshot at purchase time
  subscriptionPrice: number; // snapshot, server-recomputed
  protein: number;       // snapshot
  kcal: number;          // snapshot
}

interface SubscriptionPlan {
  _id?: ObjectId | string;
  planNumber: string;    // e.g. "SUBP-XXXX-YYYY"
  userId: ObjectId | string;
  weekStartDate: string; // ISO yyyy-mm-dd
  days: SubscriptionPlanDay[]; // skipped days omitted; length 1..7
  totalProtein: number;
  totalKcal: number;
  itemCount: number;
  subtotal: number;      // sum of day subscriptionPrice
  tax: number;           // GST, mirrors existing 5% convention
  totalAmount: number;   // subtotal + tax
  receiver: { name: string; phone: string; address: string; lat?: number; long?: number };
  deliveryTime: string;  // "HH:mm", applies to every day
  paymentMethod: "razorpay";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  status: "active" | "cancelled" | "completed";
  createdAt: Date;
  updatedAt: Date;
}
```

## Customer builder UI (mobile-first, max-w-430px)

- **Item lot:** a scrollable tray / bottom sheet listing all eligible items (veg mark,
  name, protein, kcal, `subscriptionPrice`). Source: `/api/menu` filtered by
  eligibility.
- **Week strip:** 7 day cards labelled by date + weekday, starting at the chosen start
  date. Dragging an item onto a card assigns it (one item per day; a second drop
  replaces). A card shows a clear/remove control to skip the day.
- **Interaction:** `@dnd-kit` with pointer + touch sensors for drag-and-drop; a
  tap-to-assign path (tap item → choose day) as an accessible/mobile fallback.
- **Live summary:** a sticky bar with running total protein, total kcal, item count,
  and ₹ subtotal, updating as days fill.
- **Start date:** a date input defaulting to **tomorrow** (min = tomorrow, so the
  kitchen always has lead time); the 7 day cards derive from it.
- **Checkout:**
  - Require login via existing `UserContext`; if unauthenticated, open `LoginPopup`.
  - Reuse `SelectAddressSheet` + `AddAddressSheet`; enforce the existing
    `isWithinServiceArea` / `distanceFromBusinessKm` 10km check.
  - Collect one delivery time applied to all days.
  - Respect `StoreStatusContext` (closed store → block, consistent with `/subscribe`).
  - Pay with `handleRazorpayPayment`; on success PATCH the plan to `paid` and route to
    `/subscription/success`.

## APIs

New handlers under `src/app/api/subscriptions/plans/route.ts`:

- **`POST`** — create a plan.
  - Validate: at least one day; `weekStartDate` present; each day's `productId` exists,
    is `isAvailableForSubscription`, and has `subscriptionPrice > 0`.
  - **Server-side recompute**: derive `subscriptionPrice`, `protein`, `kcal`,
    `subtotal`, `totalProtein`, `totalKcal`, `tax`, `totalAmount` from the DB — never
    trust client-supplied money/nutrition values.
  - Resolve or create the user by phone (mirrors existing subscriptions POST).
  - Insert into `subscriptionPlans`, return the created plan.
  - Honour store-closed guard like the existing subscriptions route.
- **`PATCH`** — update `paymentStatus` / `paymentId` after Razorpay (validated `_id`).
- **`GET`** — customer orders view only: returns the authenticated user's own plans,
  filtered by their `userId`/`phone`.

Admin listing is a **separate** handler `GET /api/admin/subscription-plans/route.ts`
(all plans, optional `?date=` filter for the daily view) so it is covered by the
existing admin-auth middleware that already guards every `/api/admin/*` path. This
keeps the customer route free of admin-auth branching.

## Admin ("View + daily delivery list")

- New screen `src/app/admin/subscription-plans/page.tsx`:
  - **Plans list:** customer, week start, item count, total protein, total amount,
    payment status, plan status. Status update control.
  - **Daily delivery view:** pick a date → the list of deliveries due that day
    (customer, item to cook, address, delivery time) to drive kitchen + dispatch.
- **Admin menu form** (`src/app/admin/menu/page.tsx`): add a **"Subscription price"**
  numeric input, shown/relevant when `isAvailableForSubscription` is enabled; persisted
  through the existing menu create/update API.

## Reused components & modules

`UserContext`, `LocationContext`, `LoginPopupContext`/`LoginPopup`,
`SelectAddressSheet`, `AddAddressSheet`, `helpers/razorpay.handleRazorpayPayment`,
`helpers/distance` (service-area/distance), `StoreStatusContext`. The orders view
follows the existing `/orders` page pattern.

## Testing

- Unit: server-side recomputation of subtotal/protein/kcal/tax/total; eligibility
  validation (rejects ineligible or unpriced products); plan-number generation.
- Unit/integration: middleware host-rewrite (subscription host → `/subscription`;
  primary host untouched; `/api/*` and admin never rewritten to subscription).
- Manual: full walkthrough build → login → address (in/out of service area) → pay →
  success; skipped days excluded from total and delivery; admin daily list shows the
  correct per-date deliveries.

## Out of scope (YAGNI)

- Auto-renew / recurring payment mandates.
- Per-day addresses or per-day delivery times.
- Multiple items per day or fixed meal slots.
- Coupons/discounts applied to weekly plans.
- Editing a plan after purchase (cancellation/refund handled manually via admin if
  needed).
