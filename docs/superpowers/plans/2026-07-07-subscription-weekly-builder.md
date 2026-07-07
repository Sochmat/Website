# Weekly Subscription Menu-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a customer flow at `subscription.sochmat.com` where a logged-in user drag-and-drops one subscription item per day for an upcoming week, sees a live protein/kcal/₹ tally, and pays once; plus admin management and menu `subscriptionPrice`.

**Architecture:** Same Next.js app/deploy. `middleware.ts` rewrites the `subscription.` host to a new `/subscription` route group that inherits the root-layout providers. A pure module `src/lib/subscription.ts` holds all money/nutrition/eligibility/date logic, unit-tested with vitest and reused by both the client builder and the server API so prices can't be spoofed. A new `subscriptionPlans` Mongo collection stores purchased weeks, separate from the legacy single-item `subscriptions`.

**Tech Stack:** Next.js 16 (App Router), React 19, MongoDB driver, Razorpay, antd `message`, Tailwind v4, `@dnd-kit` (new dep), vitest (new dev dep).

## Global Constraints

- Money is in whole INR rupees (integers). GST is **5%**, computed as `Math.round(subtotal * 0.05)` — copied from the existing `/subscribe` convention.
- An item is eligible for the builder **iff** `isAvailableForSubscription === true` AND `subscriptionPrice > 0`.
- One item per day; 7 day slots; days may be skipped (omitted). One-time payment, no auto-renew.
- Payment method is `razorpay` only. Reuse `handleRazorpayPayment` from `src/helpers/razorpay.ts`.
- Server API MUST recompute all prices/protein/kcal/tax/total from the DB — never trust client-supplied money or nutrition values.
- Brand colour `#f56215`; customer pages are mobile-first `max-w-[430px] mx-auto`. Match existing `/subscribe` styling.
- `/api/*` routes are shared and are NOT rewritten by middleware. The `subscription.` host must NOT expose `/admin`.
- Do not modify the legacy `subscriptions` collection, `/subscribe`, or `/api/subscriptions/route.ts`.

---

## File Structure

- Create `src/lib/subscription.ts` — pure logic: host detection, eligibility, week-date building, plan-total computation, plan-number generation.
- Create `src/lib/subscription.test.ts` — vitest unit tests for the above.
- Create `vitest.config.ts` — minimal node-env test config.
- Modify `src/lib/types.ts` — add `subscriptionPrice` to `MenuItem`; add `SubscriptionPlan`/`SubscriptionPlanDay` interfaces.
- Modify `src/app/api/menu/route.ts` — expose `subscriptionPrice` in the GET payload.
- Modify `src/app/admin/menu/page.tsx` — add a "Subscription price" input wired to form state.
- Modify `src/middleware.ts` — rewrite `subscription.` host → `/subscription`; block `/admin` on that host.
- Create `src/app/api/subscriptions/plans/route.ts` — customer `POST`/`PATCH`/`GET` for weekly plans.
- Create `src/app/api/admin/subscription-plans/route.ts` — admin `GET` (all plans, optional `?date=`) and `PATCH` (status).
- Create `src/app/subscription/page.tsx` — the drag-and-drop builder + checkout.
- Create `src/app/subscription/success/page.tsx` — post-payment confirmation.
- Create `src/app/subscription/orders/page.tsx` — the user's purchased plans.
- Create `src/app/admin/subscription-plans/page.tsx` — admin list + per-day delivery view.

---

## Task 1: Pure subscription logic module (`src/lib/subscription.ts`) + vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/subscription.ts`
- Test: `src/lib/subscription.test.ts`
- Modify: `package.json` (add `test` script + `vitest` devDependency)

**Interfaces:**
- Consumes: nothing (leaf module; imports only the `MenuItem` type).
- Produces (exact signatures later tasks rely on):
  - `isSubscriptionHost(host: string | null | undefined): boolean`
  - `isEligible(item: { isAvailableForSubscription?: boolean; subscriptionPrice?: number }): boolean`
  - `buildWeekDates(startDate: string): { date: string; weekday: string }[]` (7 entries)
  - `computePlanTotals(days: PlanDayInput[], itemsById: Map<string, PlanItem>): PlanTotals`
  - `generatePlanNumber(): string`
  - Types `PlanDayInput`, `PlanDayComputed`, `PlanTotals`, `PlanItem`; const `GST_RATE = 0.05`.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: adds `vitest` to devDependencies, no errors.

- [ ] **Step 2: Add the test script to `package.json`**

In `package.json` `"scripts"`, add:

```json
    "test": "vitest run",
```

(place it after the `"lint": "eslint"` line, adding a comma to that line).

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Write the failing test `src/lib/subscription.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  isSubscriptionHost,
  isEligible,
  buildWeekDates,
  computePlanTotals,
  generatePlanNumber,
  GST_RATE,
  type PlanItem,
} from "./subscription";

describe("isSubscriptionHost", () => {
  it("matches the subscription subdomain, ignoring port and case", () => {
    expect(isSubscriptionHost("subscription.sochmat.com")).toBe(true);
    expect(isSubscriptionHost("Subscription.sochmat.com:443")).toBe(true);
    expect(isSubscriptionHost("localhost:3000")).toBe(false);
    expect(isSubscriptionHost("sochmat.com")).toBe(false);
    expect(isSubscriptionHost(null)).toBe(false);
    expect(isSubscriptionHost(undefined)).toBe(false);
  });
});

describe("isEligible", () => {
  it("requires the flag AND a positive subscriptionPrice", () => {
    expect(isEligible({ isAvailableForSubscription: true, subscriptionPrice: 120 })).toBe(true);
    expect(isEligible({ isAvailableForSubscription: true, subscriptionPrice: 0 })).toBe(false);
    expect(isEligible({ isAvailableForSubscription: false, subscriptionPrice: 120 })).toBe(false);
    expect(isEligible({})).toBe(false);
  });
});

describe("buildWeekDates", () => {
  it("returns 7 consecutive dates with weekday labels", () => {
    const week = buildWeekDates("2026-07-07"); // a Tuesday (UTC)
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-07-07", weekday: "Tuesday" });
    expect(week[1].date).toBe("2026-07-08");
    expect(week[6].date).toBe("2026-07-13");
  });
});

describe("computePlanTotals", () => {
  const items = new Map<string, PlanItem>([
    ["a", { name: "Paneer Bowl", protein: 30, kcal: 400, subscriptionPrice: 100, isAvailableForSubscription: true }],
    ["b", { name: "Egg Bowl", protein: 25, kcal: 350, subscriptionPrice: 80, isAvailableForSubscription: true }],
    ["bad", { name: "Not Eligible", protein: 10, kcal: 100, subscriptionPrice: 0, isAvailableForSubscription: true }],
  ]);

  it("sums price/protein/kcal, rounds 5% GST, and snapshots item fields", () => {
    const totals = computePlanTotals(
      [
        { date: "2026-07-07", weekday: "Tuesday", productId: "a" },
        { date: "2026-07-08", weekday: "Wednesday", productId: "b" },
      ],
      items,
    );
    expect(totals.itemCount).toBe(2);
    expect(totals.subtotal).toBe(180);
    expect(totals.totalProtein).toBe(55);
    expect(totals.totalKcal).toBe(750);
    expect(totals.tax).toBe(Math.round(180 * GST_RATE)); // 9
    expect(totals.totalAmount).toBe(189);
    expect(totals.days[0].itemName).toBe("Paneer Bowl");
    expect(totals.days[0].subscriptionPrice).toBe(100);
  });

  it("throws when a day references an ineligible or unknown item", () => {
    expect(() =>
      computePlanTotals([{ date: "2026-07-07", weekday: "Tuesday", productId: "bad" }], items),
    ).toThrow();
    expect(() =>
      computePlanTotals([{ date: "2026-07-07", weekday: "Tuesday", productId: "missing" }], items),
    ).toThrow();
  });
});

describe("generatePlanNumber", () => {
  it("produces a SUBP-prefixed code", () => {
    expect(generatePlanNumber()).toMatch(/^SUBP-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './subscription'` (implementation not written yet).

- [ ] **Step 6: Create the implementation `src/lib/subscription.ts`**

```ts
import type { MenuItem } from "./types";

export const GST_RATE = 0.05;
export const SUBSCRIPTION_HOST_PREFIX = "subscription.";

/** Fields the builder/API need from a menu item to price a plan day. */
export interface PlanItem {
  name: string;
  protein: number;
  kcal: number;
  subscriptionPrice: number;
  isAvailableForSubscription?: boolean;
}

export interface PlanDayInput {
  date: string; // yyyy-mm-dd
  weekday: string;
  productId: string;
}

export interface PlanDayComputed extends PlanDayInput {
  itemName: string;
  subscriptionPrice: number;
  protein: number;
  kcal: number;
}

export interface PlanTotals {
  days: PlanDayComputed[];
  totalProtein: number;
  totalKcal: number;
  itemCount: number;
  subtotal: number;
  tax: number;
  totalAmount: number;
}

/** True when the request host is the subscription subdomain (port/case-insensitive). */
export function isSubscriptionHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.toLowerCase().split(":")[0].startsWith(SUBSCRIPTION_HOST_PREFIX);
}

/** An item is offered in the builder only when the flag is on AND it has a price. */
export function isEligible(item: {
  isAvailableForSubscription?: boolean;
  subscriptionPrice?: number;
}): boolean {
  return item.isAvailableForSubscription === true && (item.subscriptionPrice ?? 0) > 0;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** 7 consecutive days from `startDate` (yyyy-mm-dd), computed in UTC to avoid TZ drift. */
export function buildWeekDates(startDate: string): { date: string; weekday: string }[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const out: { date: string; weekday: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push({ date: dt.toISOString().slice(0, 10), weekday: WEEKDAYS[dt.getUTCDay()] });
  }
  return out;
}

/**
 * Recompute a plan's money/nutrition from authoritative item data.
 * Throws if any day references an item that is missing or ineligible.
 */
export function computePlanTotals(
  days: PlanDayInput[],
  itemsById: Map<string, PlanItem>,
): PlanTotals {
  const computed: PlanDayComputed[] = days.map((day) => {
    const item = itemsById.get(day.productId);
    if (!item || !isEligible(item)) {
      throw new Error(`Item ${day.productId} is not available for subscription`);
    }
    return {
      date: day.date,
      weekday: day.weekday,
      productId: day.productId,
      itemName: item.name,
      subscriptionPrice: item.subscriptionPrice,
      protein: item.protein,
      kcal: item.kcal,
    };
  });

  const subtotal = computed.reduce((s, d) => s + d.subscriptionPrice, 0);
  const totalProtein = computed.reduce((s, d) => s + d.protein, 0);
  const totalKcal = computed.reduce((s, d) => s + d.kcal, 0);
  const tax = Math.round(subtotal * GST_RATE);

  return {
    days: computed,
    totalProtein,
    totalKcal,
    itemCount: computed.length,
    subtotal,
    tax,
    totalAmount: subtotal + tax,
  };
}

export function generatePlanNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUBP-${t}-${r}`;
}

/** Narrowing helper: map a MenuItem-shaped doc to a PlanItem. */
export function toPlanItem(item: Pick<MenuItem, "name" | "protein" | "kcal"> & {
  subscriptionPrice?: number;
  isAvailableForSubscription?: boolean;
}): PlanItem {
  return {
    name: item.name,
    protein: item.protein ?? 0,
    kcal: item.kcal ?? 0,
    subscriptionPrice: item.subscriptionPrice ?? 0,
    isAvailableForSubscription: item.isAvailableForSubscription ?? false,
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all cases green.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/subscription.ts src/lib/subscription.test.ts
git commit -m "feat: pure weekly-subscription logic module + vitest"
```

---

## Task 2: Add `subscriptionPrice` to types + menu API

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/menu/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MenuItem.subscriptionPrice?: number`; `/api/menu` GET items include `subscriptionPrice: number`. Also adds `SubscriptionPlan` + `SubscriptionPlanDay` interfaces used by Tasks 5, 7, 8.

- [ ] **Step 1: Add `subscriptionPrice` to `MenuItem` in `src/lib/types.ts`**

Find (around line 38):

```ts
  isAvailableForSubscription?: boolean;
```

Add immediately below it:

```ts
  /** Flat price charged per delivery inside a weekly subscription plan. Offered in
   *  the builder only when > 0 AND isAvailableForSubscription is true. */
  subscriptionPrice?: number;
```

- [ ] **Step 2: Add plan interfaces at the end of `src/lib/types.ts`**

Append to the file:

```ts
export interface SubscriptionPlanDay {
  date: string; // yyyy-mm-dd
  weekday: string;
  productId: string;
  itemName: string;
  subscriptionPrice: number;
  protein: number;
  kcal: number;
}

export interface SubscriptionPlan {
  _id?: ObjectId | string;
  planNumber: string;
  userId: ObjectId | string;
  weekStartDate: string; // yyyy-mm-dd
  days: SubscriptionPlanDay[]; // skipped days omitted; length 1..7
  totalProtein: number;
  totalKcal: number;
  itemCount: number;
  subtotal: number;
  tax: number;
  totalAmount: number;
  receiver: {
    name: string;
    phone: string;
    address: string;
    lat?: number;
    long?: number;
  };
  deliveryTime: string; // "HH:mm", applies to every day
  paymentMethod: "razorpay";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  status: "active" | "cancelled" | "completed";
  createdAt?: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 3: Expose `subscriptionPrice` in `src/app/api/menu/route.ts`**

Find (in the `formattedItems` map):

```ts
      isAvailableForSubscription: item.isAvailableForSubscription ?? false,
```

Add immediately below it:

```ts
      subscriptionPrice: item.subscriptionPrice ?? 0,
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/app/api/menu/route.ts
git commit -m "feat: add subscriptionPrice to MenuItem + menu API; SubscriptionPlan types"
```

---

## Task 3: "Subscription price" input on the admin menu form

**Files:**
- Modify: `src/app/admin/menu/page.tsx`

**Interfaces:**
- Consumes: `MenuItem.subscriptionPrice` (Task 2). The admin menu POST/PUT already spread `data`, so the field persists once it is in the submitted payload — no API change needed.
- Produces: admins can set `subscriptionPrice` per item.

- [ ] **Step 1: Add `subscriptionPrice` to the `FormState` Omit + string field**

Find the `FormState` type (around lines 10-29). Add `| "subscriptionPrice"` to the `Omit<MenuItem, ...>` union list (put it after `| "carbs"`), and add `subscriptionPrice: string;` to the intersection block (after `carbs: string;`). Result:

```ts
type FormState = Omit<
  MenuItem,
  | "price"
  | "originalPrice"
  | "kcal"
  | "protein"
  | "rating"
  | "fiber"
  | "carbs"
  | "subscriptionPrice"
  | "variants"
> & {
  price: string;
  originalPrice: string;
  kcal: string;
  protein: string;
  rating: string;
  fiber: string;
  carbs: string;
  subscriptionPrice: string;
  variants: VariantForm[];
};
```

- [ ] **Step 2: Add it to `initialFormState`**

Find (around line 50):

```ts
  isAvailableForSubscription: false,
```

Add immediately below it:

```ts
  subscriptionPrice: "",
```

- [ ] **Step 3: Include it in the submitted payload (`toPayload`)**

Find (around lines 167-171):

```ts
      kcal: Number(formData.kcal) || 0,
      protein: Number(formData.protein) || 0,
      fiber: Number(formData.fiber) || 0,
      carbs: Number(formData.carbs) || 0,
      rating: Number(formData.rating) || 0,
```

Add after the `rating` line:

```ts
      subscriptionPrice: Number(formData.subscriptionPrice) || 0,
```

- [ ] **Step 4: Load it when editing (`handleEdit`)**

Find (around lines 214-218):

```ts
      kcal: String(item.kcal),
      protein: String(item.protein),
      fiber: String(item.fiber ?? 0),
      carbs: String(item.carbs ?? 0),
      rating: String(item.rating),
```

Add after the `rating` line:

```ts
      subscriptionPrice: String(item.subscriptionPrice ?? 0),
```

- [ ] **Step 5: Add the input to the form JSX (next to the Protein field)**

Find the Protein input block (around lines 493-505) — the `<div>` whose label reads `Protein (g)` and whose input binds `formData.protein`. Immediately AFTER that closing `</div>`, insert:

```tsx
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subscription price (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.subscriptionPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, subscriptionPrice: e.target.value })
                    }
                    placeholder="Shown in the subscription app"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  />
                </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`. Log into `/admin`, open Menu, edit an item, set "Subscription price" and enable "Available for subscription", save. Re-open the item and confirm the value persisted.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/menu/page.tsx
git commit -m "feat: subscription price input on admin menu form"
```

---

## Task 4: Middleware host-rewrite for the subscription subdomain

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `isSubscriptionHost` (Task 1).
- Produces: requests to `subscription.sochmat.com/<path>` render `/subscription/<path>`; `/admin` is blocked on that host; `/api/*` and assets are untouched.

- [ ] **Step 1: Import the host helper**

At the top of `src/middleware.ts`, after the existing imports, add:

```ts
import { isSubscriptionHost } from "@/lib/subscription";
```

- [ ] **Step 2: Add the rewrite block at the start of `middleware`**

Inside `export async function middleware(request)`, immediately after `const { pathname } = request.nextUrl;`, insert:

```ts
  // Subscription subdomain: render the /subscription route group for this host.
  // API routes and Next internals are shared and must NOT be rewritten.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (isSubscriptionHost(host)) {
    // The admin surface is never available on the subscription host.
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/subscription") &&
      !pathname.startsWith("/_next")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/subscription${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification with a spoofed Host header**

Run `npm run dev`, then in another terminal:

```bash
curl -s -H "Host: subscription.localhost" http://localhost:3000/ -o /dev/null -w "%{http_code}\n"
```

Expected: `200` and (once Task 6 exists) the builder HTML. Before Task 6, expect a 404 page rendered from `/subscription` — that is fine; it confirms the rewrite fired. Also confirm the normal host still serves the main site:

```bash
curl -s http://localhost:3000/ -o /dev/null -w "%{http_code}\n"   # 200, main site
```

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: rewrite subscription subdomain to /subscription route group"
```

---

## Task 5: Plan APIs (customer + admin)

**Files:**
- Create: `src/app/api/subscriptions/plans/route.ts`
- Create: `src/app/api/admin/subscription-plans/route.ts`

**Interfaces:**
- Consumes: `computePlanTotals`, `generatePlanNumber`, `toPlanItem`, `PlanDayInput`, `PlanItem` (Task 1); `SubscriptionPlan` (Task 2).
- Produces:
  - `POST /api/subscriptions/plans` — body `{ weekStartDate, days: {date,weekday,productId}[], receiver:{name,phone,address,lat?,long?}, deliveryTime }` → `{ success, plan }`.
  - `PATCH /api/subscriptions/plans` — body `{ _id, paymentId?, paymentStatus? }` → `{ success, plan }`.
  - `GET /api/subscriptions/plans?userId=<id>` — `{ success, plans }` (that user's plans).
  - `GET /api/admin/subscription-plans?date=<yyyy-mm-dd>` — `{ success, plans }` (all, optionally only plans delivering that date). `PATCH` — `{ _id, status }`.

- [ ] **Step 1: Create the customer route `src/app/api/subscriptions/plans/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  computePlanTotals,
  generatePlanNumber,
  toPlanItem,
  type PlanDayInput,
  type PlanItem,
} from "@/lib/subscription";

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const storeDoc = await db.collection("settings").findOne({ key: "store" });
    if (storeDoc?.open === false) {
      return NextResponse.json(
        { success: false, message: "Store is currently closed" },
        { status: 503 },
      );
    }

    const body = await request.json();

    const phone = String(body.receiver?.phone ?? "").trim().replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "receiver.phone is required" },
        { status: 400 },
      );
    }
    if (!body.weekStartDate) {
      return NextResponse.json(
        { success: false, message: "weekStartDate is required" },
        { status: 400 },
      );
    }
    const rawDays = Array.isArray(body.days) ? body.days : [];
    if (rawDays.length === 0) {
      return NextResponse.json(
        { success: false, message: "Pick at least one day" },
        { status: 400 },
      );
    }

    const days: PlanDayInput[] = rawDays.map((d: PlanDayInput) => ({
      date: String(d.date),
      weekday: String(d.weekday),
      productId: String(d.productId),
    }));

    // Authoritative item data straight from the DB, keyed by string id.
    const ids = days
      .map((d) => d.productId)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const dbItems = await db
      .collection("menuItems")
      .find({ _id: { $in: ids } })
      .toArray();
    const itemsById = new Map<string, PlanItem>();
    for (const it of dbItems) {
      itemsById.set(it._id.toString(), toPlanItem(it as never));
    }

    let totals;
    try {
      totals = computePlanTotals(days, itemsById);
    } catch (e) {
      return NextResponse.json(
        { success: false, message: (e as Error).message },
        { status: 400 },
      );
    }

    // Resolve or create the user by phone (mirrors legacy subscriptions POST).
    let user = (await db.collection("users").findOne({ phone })) as {
      _id: ObjectId;
    } | null;
    if (!user) {
      const insert = await db.collection("users").insertOne({
        phone,
        name: body.receiver?.name ?? "",
        address: body.receiver?.address ?? "",
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      user = { _id: insert.insertedId as ObjectId };
    }

    const planDoc = {
      planNumber: generatePlanNumber(),
      userId: user._id,
      weekStartDate: String(body.weekStartDate),
      days: totals.days,
      totalProtein: totals.totalProtein,
      totalKcal: totals.totalKcal,
      itemCount: totals.itemCount,
      subtotal: totals.subtotal,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      receiver: {
        name: body.receiver?.name ?? "",
        phone,
        address: body.receiver?.address ?? "",
        lat: body.receiver?.lat,
        long: body.receiver?.long,
      },
      deliveryTime: String(body.deliveryTime ?? ""),
      paymentMethod: "razorpay" as const,
      paymentStatus: "pending" as const,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("subscriptionPlans").insertOne(planDoc);
    const plan = await db
      .collection("subscriptionPlans")
      .findOne({ _id: result.insertedId });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create subscription plan" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { _id, paymentId, paymentStatus } = body;
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (paymentId !== undefined) update.paymentId = paymentId;
    if (paymentStatus !== undefined) update.paymentStatus = paymentStatus;

    const { db } = await connectToDatabase();
    const result = await db
      .collection("subscriptionPlans")
      .updateOne({ _id: new ObjectId(_id) }, { $set: update });
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 },
      );
    }
    const plan = await db
      .collection("subscriptionPlans")
      .findOne({ _id: new ObjectId(_id) });
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update subscription plan" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("_id");
    const userId = searchParams.get("userId");

    const { db } = await connectToDatabase();

    if (id && ObjectId.isValid(id)) {
      const plan = await db
        .collection("subscriptionPlans")
        .findOne({ _id: new ObjectId(id) });
      return NextResponse.json({ success: true, plan });
    }

    const filter: Record<string, unknown> = {};
    if (userId && ObjectId.isValid(userId)) {
      filter.userId = new ObjectId(userId);
    } else {
      // Never return the whole collection to an unauthenticated customer call.
      return NextResponse.json({ success: true, plans: [] });
    }

    const plans = await db
      .collection("subscriptionPlans")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscription plans" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create the admin route `src/app/api/admin/subscription-plans/route.ts`**

(Admin auth is already enforced for every `/api/admin/*` path by `src/middleware.ts`.)

```ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // yyyy-mm-dd, optional

    const { db } = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    // Only paid plans matter for the kitchen/delivery view.
    if (date) filter["days.date"] = date;

    const plans = await db
      .collection("subscriptionPlans")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error("Error fetching admin subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscription plans" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { _id, status } = await request.json();
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }
    if (!["active", "cancelled", "completed"].includes(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status" },
        { status: 400 },
      );
    }
    const { db } = await connectToDatabase();
    const result = await db
      .collection("subscriptionPlans")
      .updateOne(
        { _id: new ObjectId(_id) },
        { $set: { status, updatedAt: new Date() } },
      );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating admin subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update subscription plan" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (create a plan, reject a spoofed price)**

With `npm run dev` running and at least one eligible item (from Task 3), grab its id from `curl -s http://localhost:3000/api/menu | jq '.items[] | select(.subscriptionPrice>0) | {id,subscriptionPrice}'`. Then:

```bash
curl -s -X POST http://localhost:3000/api/subscriptions/plans \
  -H "Content-Type: application/json" \
  -d '{"weekStartDate":"2026-07-08","deliveryTime":"08:00","receiver":{"name":"Test","phone":"9999999999","address":"X"},"days":[{"date":"2026-07-08","weekday":"Wednesday","productId":"<ELIGIBLE_ID>"}]}' | jq '{success, subtotal:.plan.subtotal, total:.plan.totalAmount}'
```

Expected: `success:true` and `subtotal` equal to that item's `subscriptionPrice` (proving the server priced it, not the client). Posting a non-eligible/unknown `productId` returns `success:false` with 400.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/subscriptions/plans/route.ts src/app/api/admin/subscription-plans/route.ts
git commit -m "feat: weekly subscription plan APIs (customer + admin) with server-side pricing"
```

---

## Task 6: Customer drag-and-drop builder + checkout (`src/app/subscription/page.tsx`)

**Files:**
- Create: `src/app/subscription/page.tsx`
- Modify: `package.json` (add `@dnd-kit/core`)

**Interfaces:**
- Consumes: `/api/menu` (eligible items), `buildWeekDates` + `isEligible` + `GST_RATE` (Task 1), `POST/PATCH /api/subscriptions/plans` (Task 5), `useUser`, `useLoginPopup`, `useStoreStatus`, `SelectAddressSheet`, `AddAddressSheet`, `handleRazorpayPayment`, `isWithinServiceArea`/`distanceFromBusinessKm`.
- Produces: the `/subscription` landing builder; on paid checkout routes to `/subscription/success?planId=<id>`.

- [ ] **Step 1: Install @dnd-kit/core**

Run: `npm install @dnd-kit/core`
Expected: adds `@dnd-kit/core` to dependencies.

- [ ] **Step 2: Create `src/app/subscription/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import AddAddressSheet from "@/components/AddAddressSheet";
import { handleRazorpayPayment } from "@/helpers/razorpay";
import {
  distanceFromBusinessKm,
  isWithinServiceArea,
} from "@/helpers/distance";
import { buildWeekDates, isEligible, GST_RATE } from "@/lib/subscription";
import { type UserAddress } from "@/lib/types";

interface BuilderItem {
  id: string;
  name: string;
  protein: number;
  kcal: number;
  isVeg: boolean;
  subscriptionPrice: number;
  image: string;
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function DraggableItem({
  item,
  selected,
  onTap,
}: {
  item: BuilderItem;
  selected: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onTap}
      className={`text-left w-full bg-white rounded-xl p-3 shadow-sm border-2 ${
        selected ? "border-[#f56215]" : "border-transparent"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-3.5 h-3.5 border-2 shrink-0 flex items-center justify-center ${
            item.isVeg ? "border-green-600" : "border-red-600"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.isVeg ? "bg-green-600" : "bg-red-600"
            }`}
          />
        </span>
        <span className="font-medium text-sm text-[#111] truncate">
          {item.name}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[11px] font-semibold px-2 py-0.5 rounded-full">
          {item.protein}g protein
        </span>
        <span className="font-semibold text-sm text-[#111]">
          ₹{item.subscriptionPrice}
        </span>
      </div>
    </button>
  );
}

function DayCard({
  date,
  weekday,
  item,
  onClear,
  onTapPlace,
  tapArmed,
}: {
  date: string;
  weekday: string;
  item: BuilderItem | null;
  onClear: () => void;
  onTapPlace: () => void;
  tapArmed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}`, data: { date } });
  const dayNum = date.slice(8, 10);
  return (
    <div
      ref={setNodeRef}
      onClick={tapArmed ? onTapPlace : undefined}
      className={`rounded-xl p-2.5 min-h-[92px] border-2 transition-colors ${
        isOver || (tapArmed && !item)
          ? "border-[#f56215] bg-[#fff5ef]"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#666]">
          {weekday.slice(0, 3)} {dayNum}
        </span>
        {item && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-gray-400 text-xs"
            aria-label="Clear day"
          >
            ✕
          </button>
        )}
      </div>
      {item ? (
        <div className="mt-1.5">
          <p className="text-xs font-medium text-[#111] leading-tight line-clamp-2">
            {item.name}
          </p>
          <p className="text-[10px] text-[#009940] font-semibold mt-1">
            {item.protein}g • ₹{item.subscriptionPrice}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400 text-center">
          {tapArmed ? "Tap to add" : "Drop item"}
        </p>
      )}
    </div>
  );
}

export default function SubscriptionBuilderPage() {
  const router = useRouter();
  const { user, isAuthenticated, setUser } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const { open: storeOpen, loading: storeLoading } = useStoreStatus();

  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(tomorrowISO());
  // date -> productId
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<BuilderItem | null>(null);

  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(null);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [placing, setPlacing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  useEffect(() => {
    if (!storeLoading && !storeOpen) {
      message.info("Store is currently closed");
      router.replace("/");
    }
  }, [storeLoading, storeOpen, router]);

  useEffect(() => {
    fetch("/api/menu")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.items)) {
          const eligible = (data.items as BuilderItem[]).filter((i) =>
            isEligible(i),
          );
          setItems(eligible);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const addrs = isAuthenticated ? user?.addresses ?? [] : [];
    if (addrs.length > 0 && !selectedAddress) setSelectedAddress(addrs[0]);
  }, [isAuthenticated, user?.addresses, selectedAddress]);

  const week = useMemo(() => buildWeekDates(startDate), [startDate]);
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  // When start date changes, drop any assignment whose date left the window.
  useEffect(() => {
    const valid = new Set(week.map((w) => w.date));
    setAssignments((prev) => {
      const next: Record<string, string> = {};
      for (const [date, pid] of Object.entries(prev)) {
        if (valid.has(date)) next[date] = pid;
      }
      return next;
    });
  }, [week]);

  const assign = useCallback((date: string, productId: string) => {
    setAssignments((prev) => ({ ...prev, [date]: productId }));
  }, []);

  const clearDay = useCallback((date: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const it = e.active.data.current?.item as BuilderItem | undefined;
    if (it) setActiveItem(it);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveItem(null);
    const it = e.active.data.current?.item as BuilderItem | undefined;
    const overDate = e.over?.data.current?.date as string | undefined;
    if (it && overDate) assign(overDate, it.id);
  };

  const totals = useMemo(() => {
    const chosen = Object.values(assignments)
      .map((pid) => itemsById.get(pid))
      .filter(Boolean) as BuilderItem[];
    const subtotal = chosen.reduce((s, i) => s + i.subscriptionPrice, 0);
    const protein = chosen.reduce((s, i) => s + i.protein, 0);
    const kcal = chosen.reduce((s, i) => s + i.kcal, 0);
    const tax = Math.round(subtotal * GST_RATE);
    return {
      count: chosen.length,
      subtotal,
      protein,
      kcal,
      tax,
      total: subtotal + tax,
    };
  }, [assignments, itemsById]);

  // Address save — mirrors the proven /subscribe handler.
  const handleSaveNewAddress = async (newAddr: UserAddress) => {
    const isEditing = editingAddress !== null;
    if (isAuthenticated && user?._id) {
      const updated = isEditing
        ? (user.addresses ?? []).map((a) =>
            a.id === editingAddress?.id ? newAddr : a,
          )
        : [...(user.addresses ?? []), newAddr];
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: user._id, addresses: updated }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setSelectedAddress(newAddr);
        message.success(isEditing ? "Address updated" : "Address saved");
      } else {
        message.error(data.message ?? "Failed to save address");
      }
    } else {
      setSelectedAddress(newAddr);
      message.success("Address saved");
    }
    setShowAddAddress(false);
    setShowSelectAddress(false);
    setEditingAddress(null);
  };

  const addressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;

  const handleSubscribe = async () => {
    if (totals.count === 0) {
      message.error("Add at least one day");
      return;
    }
    if (!isAuthenticated) {
      openLoginPopup();
      return;
    }
    if (!selectedAddress) {
      message.error("Please select a delivery address");
      setShowSelectAddress(true);
      return;
    }
    if (!selectedAddress.receiverName || !selectedAddress.receiverPhone) {
      message.error("Please enter receiver name and phone");
      setShowAddAddress(true);
      return;
    }
    if (addressServiceable === false) {
      const dist = distanceFromBusinessKm(
        selectedAddress.lat,
        selectedAddress.long,
      );
      message.error(
        `Delivery not available here. You're ${dist?.toFixed(1)} km away; we deliver within 10 km.`,
      );
      return;
    }

    setPlacing(true);
    try {
      const days = week
        .filter((w) => assignments[w.date])
        .map((w) => ({
          date: w.date,
          weekday: w.weekday,
          productId: assignments[w.date],
        }));

      const res = await fetch("/api/subscriptions/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStartDate: startDate,
          days,
          deliveryTime,
          receiver: {
            name: selectedAddress.receiverName,
            phone: selectedAddress.receiverPhone,
            address: selectedAddress.address,
            lat: selectedAddress.lat,
            long: selectedAddress.long,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message ?? "Failed to create plan");
        setPlacing(false);
        return;
      }

      await handleRazorpayPayment({
        amount: data.plan.totalAmount,
        currency: "INR",
        name: "Sochmat Subscription",
        description: `Plan ${data.plan.planNumber}`,
        prefill: {
          name: selectedAddress.receiverName ?? "",
          email: "",
          contact: selectedAddress.receiverPhone ?? "",
        },
        orderId: data.plan._id,
        onSuccess: async (response) => {
          await fetch("/api/subscriptions/plans", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _id: data.plan._id,
              paymentId: response.razorpay_payment_id,
              paymentStatus: "paid",
            }),
          });
          router.push(`/subscription/success?planId=${data.plan._id}`);
        },
        onError: (err) => {
          message.error(err.message || "Payment failed");
          setPlacing(false);
        },
      });
    } catch (e) {
      message.error((e as Error).message || "Failed to create plan");
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-40">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
          <h1 className="text-lg font-bold text-[#111]">Build your week</h1>
          <p className="text-xs text-gray-500">
            {selectedItemId
              ? "Tap a day to place the selected item"
              : "Drag an item onto a day — or tap it, then tap a day"}
          </p>
        </header>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <label className="block text-xs text-gray-500 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              min={tomorrowISO()}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <label className="block text-xs text-gray-500 mt-3 mb-1">
              Daily delivery time
            </label>
            <input
              type="time"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {week.map((w) => (
              <DayCard
                key={w.date}
                date={w.date}
                weekday={w.weekday}
                item={assignments[w.date] ? itemsById.get(assignments[w.date]) ?? null : null}
                onClear={() => clearDay(w.date)}
                tapArmed={!!selectedItemId}
                onTapPlace={() => {
                  if (selectedItemId) {
                    assign(w.date, selectedItemId);
                    setSelectedItemId(null);
                  }
                }}
              />
            ))}
          </div>

          <div>
            <h2 className="font-semibold text-[#111] mb-2">Choose items</h2>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">
                No subscription items available yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {items.map((it) => (
                  <DraggableItem
                    key={it.id}
                    item={it}
                    selected={selectedItemId === it.id}
                    onTap={() =>
                      setSelectedItemId((cur) => (cur === it.id ? null : it.id))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-[#111]">Delivery address</p>
                {selectedAddress ? (
                  <>
                    <p className="text-sm text-[#111] mt-1">
                      {selectedAddress.address}
                    </p>
                    {selectedAddress.receiverName && (
                      <p className="text-xs text-[#737373] mt-0.5">
                        Deliver to: {selectedAddress.receiverName}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#737373] mt-1">Add delivery address</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSelectAddress(true)}
                className="text-[#f56215] font-semibold text-sm underline"
              >
                {selectedAddress ? "Change" : "Add"}
              </button>
            </div>
          </div>
        </div>

        {/* Sticky summary + CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 p-4">
          <div className="flex items-center justify-between text-xs text-[#666] mb-2">
            <span>{totals.count} days</span>
            <span className="font-semibold text-[#009940]">
              {totals.protein}g protein · {totals.kcal} kcal
            </span>
          </div>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={placing || totals.count === 0}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
          >
            {placing
              ? "Placing…"
              : totals.count === 0
                ? "Add days to continue"
                : `Subscribe · ₹${totals.total}`}
          </button>
        </div>

        <SelectAddressSheet
          open={showSelectAddress && !showAddAddress}
          onClose={() => {
            setShowSelectAddress(false);
            setEditingAddress(null);
          }}
          addresses={isAuthenticated ? user?.addresses ?? [] : []}
          selectedAddress={selectedAddress}
          onSelect={(addr) => {
            setSelectedAddress(addr);
            setShowSelectAddress(false);
          }}
          onAddNew={() => {
            setEditingAddress(null);
            setShowSelectAddress(false);
            setShowAddAddress(true);
          }}
          onEdit={(addr) => {
            setEditingAddress(addr);
            setShowSelectAddress(false);
            setShowAddAddress(true);
          }}
        />
        <AddAddressSheet
          open={showAddAddress}
          onClose={() => {
            setShowAddAddress(false);
            setEditingAddress(null);
          }}
          onSave={handleSaveNewAddress}
          editAddress={editingAddress}
        />

        <DragOverlay>
          {activeItem ? (
            <div className="bg-white rounded-xl p-3 shadow-lg border-2 border-[#f56215]">
              <span className="font-medium text-sm text-[#111]">
                {activeItem.name}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </main>
    </DndContext>
  );
}
```

- [ ] **Step 3: Verify SelectAddressSheet / AddAddressSheet prop names match**

Run: `grep -n "interface.*Props\|open\|onSelect\|onAddNew\|onEdit\|onSave\|editAddress\|addresses\|selectedAddress" src/components/SelectAddressSheet.tsx src/components/AddAddressSheet.tsx`
Expected: the prop names used above (`open`, `onClose`, `addresses`, `selectedAddress`, `onSelect`, `onAddNew`, `onEdit` for Select; `open`, `onClose`, `onSave`, `editAddress` for Add) exist. If any differ, adjust the JSX in Step 2 to the real names (they are the same props `/subscribe/page.tsx` passes).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

`npm run dev`, then open `http://localhost:3000/subscription` (works directly because the path exists; the subdomain rewrite maps to the same page). Confirm: eligible items appear; dragging an item onto a day fills it; tapping an item then a day also fills it; the ✕ clears a day; the summary shows live protein/kcal/₹; changing start date reshuffles day labels and drops out-of-window items. Clicking Subscribe while logged out opens the login popup.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/subscription/page.tsx
git commit -m "feat: drag-and-drop weekly subscription builder + checkout"
```

---

## Task 7: Subscription success + orders pages

**Files:**
- Create: `src/app/subscription/success/page.tsx`
- Create: `src/app/subscription/orders/page.tsx`

**Interfaces:**
- Consumes: `GET /api/subscriptions/plans?_id=` and `?userId=` (Task 5); `SubscriptionPlan` type (Task 2); `useUser`, `useLoginPopup`.
- Produces: confirmation view and the user's plan history.

- [ ] **Step 1: Create `src/app/subscription/success/page.tsx`**

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "lucide-react";
import { SubscriptionPlan } from "@/lib/types";

function SuccessContent() {
  const planId = useSearchParams().get("planId");
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (!planId) return;
    fetch(`/api/subscriptions/plans?_id=${planId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.plan) setPlan(d.plan as SubscriptionPlan);
      })
      .catch(() => {});
  }, [planId]);

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center mt-8">
        <CheckCircleIcon className="w-14 h-14 text-[#009940] mx-auto" />
        <h1 className="text-xl font-bold text-[#111] mt-3">Subscription confirmed</h1>
        {plan && (
          <p className="text-sm text-gray-500 mt-1">
            {plan.planNumber} · {plan.itemCount} days · ₹{plan.totalAmount}
          </p>
        )}
      </div>

      {plan && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <h2 className="font-semibold text-[#111] mb-2">Your week</h2>
          <div className="space-y-2">
            {plan.days.map((d) => (
              <div key={d.date} className="flex justify-between text-sm">
                <span className="text-[#666]">
                  {d.weekday.slice(0, 3)} {d.date.slice(5)}
                </span>
                <span className="text-[#111] font-medium">{d.itemName}</span>
                <span className="text-[#009940]">{d.protein}g</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between text-sm font-semibold">
            <span>Total protein</span>
            <span className="text-[#009940]">{plan.totalProtein}g</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Link
          href="/subscription/orders"
          className="flex-1 text-center bg-white border border-gray-200 text-[#111] font-medium py-3 rounded-xl"
        >
          My subscriptions
        </Link>
        <Link
          href="/subscription"
          className="flex-1 text-center bg-[#f56215] text-white font-semibold py-3 rounded-xl"
        >
          Build another
        </Link>
      </div>
    </main>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Create `src/app/subscription/orders/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { SubscriptionPlan } from "@/lib/types";

export default function SubscriptionOrdersPage() {
  const { user, isAuthenticated, isLoading } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user?._id) {
      setLoading(false);
      return;
    }
    fetch(`/api/subscriptions/plans?userId=${user._id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.plans)) setPlans(d.plans);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, user?._id]);

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link href="/subscription" className="p-2 -ml-2 text-[#111]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-[#111]">My subscriptions</h1>
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : !isAuthenticated ? (
          <button
            onClick={openLoginPopup}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl"
          >
            Log in to see your subscriptions
          </button>
        ) : plans.length === 0 ? (
          <p className="text-gray-500 text-sm">No subscriptions yet.</p>
        ) : (
          plans.map((p) => (
            <div key={String(p._id)} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-[#111]">{p.planNumber}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.paymentStatus === "paid"
                      ? "bg-[rgba(0,153,64,0.1)] text-[#009940]"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.paymentStatus}
                </span>
              </div>
              <p className="text-sm text-[#666] mt-1">
                Week of {p.weekStartDate} · {p.itemCount} days
              </p>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-[#009940] font-medium">
                  {p.totalProtein}g protein
                </span>
                <span className="font-semibold text-[#111]">₹{p.totalAmount}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Confirm `useUser` exposes `isLoading`**

Run: `grep -n "isLoading" src/context/UserContext.tsx`
Expected: `isLoading` is part of the context value. If it is named differently (e.g. the value is absent), remove the `isLoading` guard and instead gate on `user === null` — but the `/orders` page already uses `isLoading` from `useUser`, so it exists.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

After paying a plan in Task 6, confirm the browser lands on `/subscription/success?planId=…` showing the week, and `/subscription/orders` lists the plan for the logged-in user.

- [ ] **Step 6: Commit**

```bash
git add src/app/subscription/success/page.tsx src/app/subscription/orders/page.tsx
git commit -m "feat: subscription success + orders pages"
```

---

## Task 8: Admin plans screen (list + daily delivery view)

**Files:**
- Create: `src/app/admin/subscription-plans/page.tsx`
- Modify: the admin navigation (see Step 3)

**Interfaces:**
- Consumes: `GET /api/admin/subscription-plans` + `?date=`, `PATCH` (Task 5); `SubscriptionPlan` type.
- Produces: an admin screen to review purchased plans and a per-date delivery list.

- [ ] **Step 1: Create `src/app/admin/subscription-plans/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { SubscriptionPlan } from "@/lib/types";

type Tab = "plans" | "daily";

export default function AdminSubscriptionPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = tab === "daily" ? `?date=${date}` : "";
    try {
      const res = await fetch(`/api/admin/subscription-plans${qs}`);
      const data = await res.json();
      if (data?.success) setPlans(data.plans);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [tab, date]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: id, status }),
    });
    load();
  };

  // Flatten to per-delivery rows for the daily view.
  const deliveries =
    tab === "daily"
      ? plans.flatMap((p) =>
          p.days
            .filter((d) => d.date === date)
            .map((d) => ({
              plan: p,
              item: d.itemName,
              protein: d.protein,
            })),
        )
      : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-4">Subscription plans</h1>

      <div className="flex gap-2 mb-4">
        {(["plans", "daily"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {t === "plans" ? "All plans" : "Daily deliveries"}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : tab === "plans" ? (
        <div className="space-y-3">
          {plans.length === 0 && <p className="text-gray-500">No plans yet.</p>}
          {plans.map((p) => (
            <div
              key={String(p._id)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex justify-between">
                <span className="font-semibold text-[#111]">{p.planNumber}</span>
                <span className="text-sm text-gray-500">
                  {p.receiver?.name} · {p.receiver?.phone}
                </span>
              </div>
              <p className="text-sm text-[#666] mt-1">
                Week {p.weekStartDate} · {p.itemCount} days · {p.totalProtein}g
                protein · ₹{p.totalAmount} ·{" "}
                <span className="font-medium">{p.paymentStatus}</span>
              </p>
              <div className="flex gap-2 mt-2">
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(String(p._id), e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                >
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.length === 0 && (
            <p className="text-gray-500">No deliveries on {date}.</p>
          )}
          {deliveries.map((d, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between"
            >
              <div>
                <p className="font-medium text-[#111]">{d.item}</p>
                <p className="text-sm text-[#666]">
                  {d.plan.receiver?.name} · {d.plan.receiver?.phone}
                </p>
                <p className="text-sm text-[#666]">{d.plan.receiver?.address}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#009940] font-medium">{d.protein}g</p>
                <p className="text-sm text-[#666]">{d.plan.deliveryTime}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Discover the admin nav to add a link**

Run: `grep -rn "admin/subscriptions\|admin/orders\|admin/menu" src/app/admin --include=*.tsx -l | head`
Then inspect the file that renders the admin sidebar/nav links (the one listing `/admin/orders`, `/admin/menu`, etc.).

- [ ] **Step 3: Add a nav link to the admin menu**

In the admin nav file found in Step 2, add an entry pointing to `/admin/subscription-plans` labelled "Subscription Plans", following the exact shape of the neighbouring link entries (same array/object or JSX pattern the other links use).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

`npm run dev`, log into `/admin`, open "Subscription Plans". Confirm the plan created earlier appears under "All plans"; switch to "Daily deliveries", set the date to one of that plan's days, and confirm the delivery row shows item, receiver, address, and time. Change a plan's status and confirm it persists on reload.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/subscription-plans/page.tsx <admin-nav-file>
git commit -m "feat: admin subscription plans list + daily delivery view"
```

---

## Task 9: Full walkthrough + final checks

**Files:** none (verification only).

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all `subscription.test.ts` cases pass.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean (or only pre-existing warnings unrelated to new files).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; `/subscription`, `/subscription/success`, `/subscription/orders`, and `/admin/subscription-plans` all compile.

- [ ] **Step 4: End-to-end manual pass**

With `npm run dev`: as admin, mark an item eligible + set a subscription price. As a customer on `/subscription`, build a 3-day week (drag + tap), log in, add a serviceable address, pay via Razorpay test, land on success, and see the plan in `/subscription/orders` and in admin `/admin/subscription-plans` (both tabs). Verify a spoofed higher price from the client is ignored (server total matches the sum of DB `subscriptionPrice`).

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: weekly subscription flow verification pass"
```

---

## Self-Review Notes

- **Spec coverage:** routing/rewrite (T4), `subscriptionPrice` field + menu API (T2) + admin input (T3), separate `subscriptionPlans` collection + server-recompute APIs (T5), drag-and-drop one-item-per-day builder with live protein tally + login-gated Razorpay checkout reusing address sheets/service-area (T6), success + orders views reusing user context (T7), admin list + daily delivery view (T8), tests + middleware host logic (T1, T4), full verification (T9). All spec sections map to a task.
- **Out of scope (unchanged):** auto-renew, per-day address/time, multiple items/day, coupons — none implemented, matching the spec.
- **Type consistency:** `PlanItem`/`PlanDayInput`/`PlanTotals`/`computePlanTotals`/`buildWeekDates`/`isEligible`/`isSubscriptionHost`/`generatePlanNumber`/`toPlanItem` are defined in T1 and consumed with identical names/signatures in T5/T6. `SubscriptionPlan`/`SubscriptionPlanDay` defined in T2, consumed in T5/T7/T8. Plan-day field names (`date`, `weekday`, `productId`, `itemName`, `subscriptionPrice`, `protein`, `kcal`) are identical across builder, API, and admin.
