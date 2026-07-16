# Admin Dashboard — Design

Date: 2026-07-16

## Goal

A new admin dashboard route surfacing the most important business stats,
filtered by a date range that defaults to the last 7 days.

## Routes

- **Page:** `src/app/admin/dashboard/page.tsx` — client component (antd + tailwind,
  matching existing admin pages).
- **API:** `src/app/api/admin/dashboard/route.ts` — single `GET`, returns all
  stats for a range via `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Both params are IST
  calendar dates, inclusive. When absent, defaults to the last 7 days
  (today − 6 … today, IST).
- **Nav:** `admin/layout.tsx` gains a "Dashboard" link (admin-only, hidden for
  shop role). `/admin` (`admin/page.tsx`) redirects admin-role users to
  `/admin/dashboard`; shop role still → `/admin/orders`.

## Date handling

`from`/`to` are IST dates. Convert to UTC instants for `createdAt` filtering:
- lower bound (inclusive) = `Date.UTC(y,mo-1,d) − 330·60000`
- upper bound (exclusive) = lower bound of the day after `to`

IST offset is a fixed +5:30 (see `src/lib/ist.ts`). All aggregations share the
same `{ createdAt: { $gte, $lt } }` window.

## API response shape

```jsonc
{
  "range": { "from": "2026-07-10", "to": "2026-07-16" },
  "sales": {
    "orders":        { "paidAmount": 0, "paidCount": 0, "pendingCount": 0, "failedCount": 0, "refundedCount": 0 },
    "subscriptions": { "paidAmount": 0, "paidCount": 0, "pendingCount": 0, "failedCount": 0, "refundedCount": 0 },
    "totalPaidAmount": 0
  },
  "users": { "total": 0, "newInRange": 0, "buyersInRange": 0, "newBuyers": 0, "repeatBuyers": 0 },
  "topItems": [ { "productId": "…", "name": "…", "isVeg": true, "quantity": 0, "revenue": 0 } ]
}
```

### Computation

- **sales.orders / sales.subscriptions:** group each collection's docs in range
  by `paymentStatus`; sum `totalAmount` for `paid`, count each status.
  `totalPaidAmount = orders.paidAmount + subscriptions.paidAmount`.
- **users.total:** all-time `countDocuments` on `users`.
- **users.newInRange:** `users` with `createdAt` in range.
- **new vs repeat buyers:** over `orders` with `paymentStatus: "paid"`, group by
  `userId` → each user's first-ever paid-order date (`min createdAt`, all time).
  A user with ≥1 paid order in range is a buyer; `newBuyers` = first paid order
  falls inside range, `repeatBuyers` = first paid order predates the range.
  `buyersInRange = newBuyers + repeatBuyers`.
- **topItems:** `paid` orders in range → `$unwind orderItems` → group by
  `productId` summing `quantity` and `price·quantity` (revenue) → sort by
  quantity desc → limit 10 → `$lookup menuItems` for `name`/`isVeg`.

## Page layout

Header: "Dashboard" title, a preset `Segmented` (Today / 7d / 30d / This month)
and an antd `RangePicker` bound to the same state.

Four stat cards:
1. **Total sales** — ₹ paid headline; secondary split: orders ₹X, subs ₹Y.
2. **Orders** — paid count headline; pending / failed chips.
3. **Subscriptions** — paid count headline; pending / failed chips.
4. **Users** — total headline; +new-in-range and repeat-buyers secondary.

Below: **Most ordered items** table — rank, veg dot, name, quantity, revenue.

Loading skeletons while fetching; empty states when the range has no data.
Changing the preset or range refetches. All amounts use `tabular-nums` and
`₹` INR formatting.

## Out of scope

Charts/time-series, CSV export, per-item drill-down. Can follow later.
