# Admin Store Open/Close Toggle

**Date:** 2026-05-08
**Status:** Approved
**Owner:** Harsh

## Problem

Admins need a way to temporarily stop accepting orders (e.g. kitchen closed, holiday, ingredients out) without taking the site down. Today there is no such control: customers can always add items to cart and reach checkout/subscribe routes regardless of whether the store can fulfill orders.

## Goal

Provide a single switch in the admin header that toggles the store's online state. When the store is OFF:

- Customers cannot add items to cart (add buttons hidden).
- Customers cannot reach buying routes: `/order`, `/success`, `/subscribe` redirect to `/`.
- Customers can still view order history at `/orders`.
- Home/menu pages display a "Store currently closed" banner.
- Existing items already in a customer's cart are preserved (only checkout is blocked).

When the store is ON, behavior is unchanged from today.

## Non-Goals

- No scheduled open/close hours. Manual toggle only.
- No per-item availability beyond what already exists.
- No real authentication on the admin API (matches existing project pattern in `/api/admin/banner`). Token-based gating remains client-side only.
- No notification to customers currently mid-checkout when the toggle flips. They'll be redirected on next navigation or when polling refreshes status (1 hour cadence).

## Data Model

New MongoDB collection: `settings`.

Single document for store state:

```ts
{
  _id: ObjectId,
  key: "store",       // unique key; allows future settings docs in the same collection
  open: boolean,
  updatedAt: Date
}
```

If the document is missing (first run, fresh DB), reads return `open: true` (fail-open default). The first admin write upserts it.

## API

### `GET /api/store-status` (public)

Returns the current store state. Used by the customer-facing context.

Response:
```json
{ "success": true, "open": true }
```

Headers: `Cache-Control: no-store` so browser/CDN never caches.

### `POST /api/admin/store-status` (admin)

Updates the flag. Body: `{ "open": boolean }`. Upserts the `settings` doc with `key: "store"`.

Response:
```json
{ "success": true, "open": false }
```

Authentication: matches existing admin route pattern in this codebase (no server-side token verification today; protected by client-side `adminToken` gate in `src/app/admin/layout.tsx`). Documented as a known limitation; not in scope for this change.

## Client State

New file: `src/context/StoreStatusContext.tsx`.

```ts
interface StoreStatusContextType {
  open: boolean;          // defaults to true while loading
  loading: boolean;       // true until first fetch resolves
  refresh: () => Promise<void>;
  setOpen: (value: boolean) => Promise<void>;  // admin-only; calls POST
}
```

Behavior:
- On mount, `fetch("/api/store-status", { cache: "no-store" })`.
- After first load, `setInterval` every **1 hour** to refresh.
- `setOpen` does an optimistic update, then POSTs `/api/admin/store-status`. On failure, revert and show a toast.
- Hook: `useStoreStatus()`.

Mounted in `src/app/layout.tsx`, nested inside `CartProvider`:

```tsx
<UserProvider>
  <LoginPopupProvider>
    <CartProvider>
      <StoreStatusProvider>
        <LocationProvider>
          ...
```

## Customer-Side Changes

| File | Change |
|---|---|
| `src/components/MenuItem.tsx` | When `!open`, do not render the ADD button or the quantity stepper. The image area still renders normally; nothing else changes. |
| `src/components/RecommendedItem.tsx` | Same: hide the add control when `!open`. |
| `src/components/CartBar.tsx` | Hide the floating cart bar when `!open`. Cart items are still in memory. |
| `src/app/order/page.tsx` | On render: if `!loading && !open`, `router.replace("/")` and show `toast("Store is currently closed")`. |
| `src/app/success/page.tsx` | Same redirect + toast pattern. |
| `src/app/subscribe/page.tsx` | Same redirect + toast pattern. |
| `src/app/orders/page.tsx` | Unchanged (history stays accessible). |
| `src/app/page.tsx` (home) | When `!open`, render a banner above existing content: "Store is currently closed — orders will resume soon." Tailwind: amber/yellow palette to match existing patterns. |
| `src/app/menu/page.tsx` | Same banner placement. |

The banner is a small sticky/inline strip near the top of the page. Reuses Tailwind classes already in the project (e.g. `bg-yellow-50 border-b border-yellow-200 text-yellow-900`, mirroring the admin sound-enable banner).

## Admin Header Toggle

In `src/app/admin/layout.tsx`, add a toggle button to the right side of `<nav>`, before the existing Logout button.

Visual:
- Pill-shaped button.
- Label: `Store: ON` (green background `#024731` text white) or `Store: OFF` (red background `#dc2626` text white).
- A small dot indicator on the left changes color/position to suggest a switch.
- Disabled while a POST is in flight.

Behavior:
- Reads from `useStoreStatus()`.
- On click: call `setOpen(!open)`. Provider handles optimistic + revert.
- On error: `react-hot-toast` error message.

## Loading / Hydration Considerations

`open` defaults to `true` during loading so we don't flash:
- Closed banner on home/menu.
- Empty space where ADD buttons should be.
- A redirect away from `/order`.

The redirect on order pages uses both `!loading && !open`, so first render either shows the cart UI (open) or briefly nothing then redirect (closed). No false redirects.

Polling cadence is 1 hour (per user spec). Customers loading the site fresh see the current state immediately. Admin sees their own change instantly via optimistic update; other open admin tabs converge on next poll.

## Edge Cases

1. **Empty settings collection** — first read finds no doc. Return `open: true`. Admin's first toggle creates the doc via upsert.
2. **API failure on customer fetch** — provider keeps `open: true` (fail-open). Logs error to console.
3. **API failure on admin toggle** — revert local state, toast `"Failed to update store status"`.
4. **Customer cart not empty when admin closes store** — cart items preserved in memory. `CartBar` hides; `/order` redirects. If admin reopens later in same session, cart and bar reappear with original items.
5. **Two admin tabs** — second tab's button state may be stale up to 1 hour. Acceptable for this use case.
6. **Customer mid-checkout** — Razorpay flow is initiated from `/order`. If admin toggles off while customer is on Razorpay's modal, this design does not interrupt them. After payment success they land on `/success`, which will redirect to home if status is now closed; their order is still recorded.

## Testing Checklist

- [ ] `GET /api/store-status` with empty `settings` collection returns `open: true`.
- [ ] `POST /api/admin/store-status` with `{ open: false }` upserts the doc; subsequent GET returns `false`.
- [ ] Admin header toggle reflects current DB state on load and flips on click.
- [ ] Menu page (`/menu`) hides ADD buttons and shows banner when store is closed.
- [ ] `RecommendedItem` add control hidden when closed.
- [ ] `CartBar` hidden when closed (even with items in cart).
- [ ] `/order` redirects to `/` with toast when closed.
- [ ] `/success` redirects to `/` with toast when closed.
- [ ] `/subscribe` redirects to `/` with toast when closed.
- [ ] `/orders` (history) remains accessible when closed.
- [ ] Toggling open restores all functionality without page reload (current tab; other tabs after 1h).
- [ ] No flash of closed state during initial load.

## Files Changed / Added

**New:**
- `src/context/StoreStatusContext.tsx`
- `src/app/api/store-status/route.ts`
- `src/app/api/admin/store-status/route.ts`

**Modified:**
- `src/app/layout.tsx` — wrap with `StoreStatusProvider`.
- `src/app/admin/layout.tsx` — add toggle button.
- `src/components/MenuItem.tsx` — hide add control when closed.
- `src/components/RecommendedItem.tsx` — hide add control when closed.
- `src/components/CartBar.tsx` — hide bar when closed.
- `src/app/order/page.tsx` — redirect when closed.
- `src/app/success/page.tsx` — redirect when closed.
- `src/app/subscribe/page.tsx` — redirect when closed.
- `src/app/page.tsx` — banner when closed.
- `src/app/menu/page.tsx` — banner when closed.
