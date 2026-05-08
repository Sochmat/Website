# Admin Store Open/Close Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-controlled switch that closes the store: customers can no longer add items to cart or reach checkout/subscribe routes, but cart contents and order history remain accessible.

**Architecture:** A single `settings` MongoDB document with `key: "store"` holds the `open` flag. A new `StoreStatusContext` exposes the flag to all customer surfaces (default `true` while loading, polled every 1 hour after first load). Customer components conditionally hide ADD controls and the cart bar; buying routes (`/order`, `/success`, `/subscribe`) redirect to `/` with a toast when closed; home/menu render a "Store closed" banner. Admin header toggles via `POST /api/admin/store-status`.

**Tech Stack:** Next.js 16 (App Router, React 19), MongoDB driver, Tailwind v4, antd `message` for toasts (already in use), `react-hot-toast` is available but the project standard is antd.

**Note on testing:** This repo has no unit-test framework configured (only `next dev`, `next build`, `eslint`). Verification per task = `npm run lint` (must pass) + `npm run build` (must succeed; runs TS typecheck) + a brief manual browser check where applicable. Each task ends with a commit.

---

## File Plan

**New files:**
- `src/app/api/store-status/route.ts` — public GET handler
- `src/app/api/admin/store-status/route.ts` — admin POST handler
- `src/context/StoreStatusContext.tsx` — provider + hook

**Modified files:**
- `src/app/layout.tsx` — wrap with `StoreStatusProvider`
- `src/app/admin/layout.tsx` — add toggle button to header
- `src/components/MenuItem.tsx` — hide add control container when closed
- `src/components/RecommendedItem.tsx` — hide plus button when closed
- `src/components/CartBar.tsx` — hide bar when closed
- `src/app/order/page.tsx` — redirect when closed
- `src/app/success/page.tsx` — redirect when closed
- `src/app/subscribe/page.tsx` — redirect when closed
- `src/app/page.tsx` — banner when closed
- `src/app/menu/page.tsx` — banner when closed

---

## Task 1: Public GET `/api/store-status`

**Files:**
- Create: `src/app/api/store-status/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/store-status/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection("settings").findOne({ key: "store" });
    const open = doc?.open ?? true;
    return NextResponse.json(
      { success: true, open },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching store status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch store status", open: true },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

- [ ] **Step 2: Verify lint and build**

Run: `npm run lint`
Expected: no errors in the new file.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Smoke-test the endpoint**

Run dev server in another terminal: `npm run dev`
In a browser or curl: `curl http://localhost:3000/api/store-status`
Expected: `{"success":true,"open":true}` (since `settings` collection is empty initially).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/store-status/route.ts
git commit -m "feat: add public GET /api/store-status endpoint"
```

---

## Task 2: Admin POST `/api/admin/store-status`

**Files:**
- Create: `src/app/api/admin/store-status/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/admin/store-status/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.open !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Body must include boolean 'open'" },
        { status: 400 },
      );
    }
    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: "store" },
      { $set: { key: "store", open: body.open, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true, open: body.open });
  } catch (error) {
    console.error("Error updating store status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update store status" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify lint and build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Smoke-test the endpoint**

With dev server running:
```bash
curl -X POST http://localhost:3000/api/admin/store-status -H "Content-Type: application/json" -d '{"open":false}'
```
Expected: `{"success":true,"open":false}`

Then verify GET reflects the change:
```bash
curl http://localhost:3000/api/store-status
```
Expected: `{"success":true,"open":false}`

Reset to open:
```bash
curl -X POST http://localhost:3000/api/admin/store-status -H "Content-Type: application/json" -d '{"open":true}'
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/store-status/route.ts
git commit -m "feat: add admin POST /api/admin/store-status endpoint"
```

---

## Task 3: `StoreStatusContext` provider + hook

**Files:**
- Create: `src/context/StoreStatusContext.tsx`

- [ ] **Step 1: Create the context file**

Create `src/context/StoreStatusContext.tsx` with:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

interface StoreStatusContextType {
  open: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  setOpen: (value: boolean) => Promise<boolean>;
}

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const StoreStatusContext = createContext<StoreStatusContextType | undefined>(
  undefined,
);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(true);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store-status", { cache: "no-store" });
      const data = await res.json();
      if (cancelledRef.current) return;
      if (data?.success && typeof data.open === "boolean") {
        setOpenState(data.open);
      }
    } catch (error) {
      console.error("Failed to fetch store status:", error);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  const setOpen = useCallback(
    async (value: boolean) => {
      const previous = open;
      setOpenState(value); // optimistic
      try {
        const res = await fetch("/api/admin/store-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ open: value }),
        });
        const data = await res.json();
        if (!data?.success) {
          setOpenState(previous);
          return false;
        }
        return true;
      } catch (error) {
        console.error("Failed to update store status:", error);
        setOpenState(previous);
        return false;
      }
    },
    [open],
  );

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
    };
  }, [refresh]);

  return (
    <StoreStatusContext.Provider value={{ open, loading, refresh, setOpen }}>
      {children}
    </StoreStatusContext.Provider>
  );
}

export function useStoreStatus() {
  const ctx = useContext(StoreStatusContext);
  if (!ctx) {
    throw new Error("useStoreStatus must be used within a StoreStatusProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Verify lint and build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/context/StoreStatusContext.tsx
git commit -m "feat: add StoreStatusContext with 1h polling"
```

---

## Task 4: Mount provider in root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the import**

In `src/app/layout.tsx`, add this import below the existing context imports:

```tsx
import { StoreStatusProvider } from "@/context/StoreStatusContext";
```

- [ ] **Step 2: Wrap children with the provider**

Inside the existing JSX, wrap the existing `<LocationProvider>` block with `<StoreStatusProvider>`. The relevant section becomes:

```tsx
<UserProvider>
  <LoginPopupProvider>
    <CartProvider>
      <StoreStatusProvider>
        <LocationProvider>
          <LocationPrompt />
          {children}
          <LoginPopup />
          {/* <OrderPromptModal /> */}
        </LocationProvider>
      </StoreStatusProvider>
    </CartProvider>
  </LoginPopupProvider>
</UserProvider>
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: mount StoreStatusProvider in root layout"
```

---

## Task 5: Hide ADD control in `MenuItem.tsx` when store is closed

**Files:**
- Modify: `src/components/MenuItem.tsx`

- [ ] **Step 1: Add the import and hook usage**

At the top of `src/components/MenuItem.tsx`, add the import after the existing context import:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
```

Inside the `MenuItem` component, after the existing `useCart()` line, add:

```tsx
const { open: storeOpen } = useStoreStatus();
```

- [ ] **Step 2: Conditionally hide the ADD control container**

In the JSX, locate this block (it contains the slanted-notch SVG and the ADD/quantity button):

```tsx
{/* ADD button with slanted notch */}
<div className="absolute bottom-0 right-[10px]">
  <svg ...>
    <path ... />
  </svg>
  {quantity > 0 ? (
    ...
  ) : (
    ...
  )}
</div>
```

Wrap the entire `<div className="absolute bottom-0 right-[10px]">` block in a conditional so it only renders when `storeOpen` is true:

```tsx
{storeOpen && (
  <div className="absolute bottom-0 right-[10px]">
    {/* ...existing svg + button content unchanged... */}
  </div>
)}
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

With dev server running and store toggled OFF (use Task 2 curl), visit `/menu`. Confirm ADD buttons are no longer rendered on menu cards. Toggle ON; confirm buttons reappear after refresh.

- [ ] **Step 5: Commit**

```bash
git add src/components/MenuItem.tsx
git commit -m "feat: hide MenuItem add control when store is closed"
```

---

## Task 6: Hide plus button in `RecommendedItem.tsx` when store is closed

**Files:**
- Modify: `src/components/RecommendedItem.tsx`

- [ ] **Step 1: Add the import and hook usage**

Add at the top imports:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
```

Inside `RecommendedItem`, after the existing `useCart()` line, add:

```tsx
const { open: storeOpen } = useStoreStatus();
```

- [ ] **Step 2: Conditionally hide the plus button**

In the JSX, locate this block:

```tsx
<button
  onClick={handleAddClick}
  className="absolute right-2 bottom-2 bg-white p-1.5 rounded-lg shadow-md border border-[#f56215]"
>
  <PlusIcon className="w-5 h-5 text-[#f56215]" />
</button>
```

Wrap it in a conditional so it only renders when `storeOpen` is true:

```tsx
{storeOpen && (
  <button
    onClick={handleAddClick}
    className="absolute right-2 bottom-2 bg-white p-1.5 rounded-lg shadow-md border border-[#f56215]"
  >
    <PlusIcon className="w-5 h-5 text-[#f56215]" />
  </button>
)}
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

Recommended-item rails appear in cart context (`/order`). With store closed, navigate to a place that renders `RecommendedItem` and verify the plus button is hidden.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecommendedItem.tsx
git commit -m "feat: hide RecommendedItem plus button when store is closed"
```

---

## Task 7: Hide `CartBar` when store is closed

**Files:**
- Modify: `src/components/CartBar.tsx`

- [ ] **Step 1: Add the import and hook usage**

Add the import:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
```

Inside `CartBar`, after the existing `useCart()` destructure, add:

```tsx
const { open: storeOpen } = useStoreStatus();
```

- [ ] **Step 2: Update the early-return guard**

Change the existing line:

```tsx
if (totalItems === 0) return null;
```

to:

```tsx
if (totalItems === 0 || !storeOpen) return null;
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

With store open: add an item — bar appears. Toggle store closed via curl, refresh: bar disappears even though the cart context still has items. Toggle open, refresh: bar reappears with the same items.

- [ ] **Step 5: Commit**

```bash
git add src/components/CartBar.tsx
git commit -m "feat: hide CartBar when store is closed"
```

---

## Task 8: Redirect `/order` to home when store is closed

**Files:**
- Modify: `src/app/order/page.tsx`

- [ ] **Step 1: Add the import**

Add this import alongside the other context imports near the top:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
```

- [ ] **Step 2: Add the hook + redirect effect**

Inside `OrderPage`, after the existing `useLoginPopup()` line and before the existing redirect-on-login `useEffect`, add:

```tsx
const { open: storeOpen, loading: storeLoading } = useStoreStatus();

useEffect(() => {
  if (!storeLoading && !storeOpen) {
    message.info("Store is currently closed");
    router.replace("/");
  }
}, [storeLoading, storeOpen, router]);
```

Note: `router`, `useRouter`, `useEffect`, and antd `message` are already imported in this file — no new imports beyond `useStoreStatus`.

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

Toggle store closed. Visit `/order`. Expected: brief render, then redirect to `/`, with antd info toast "Store is currently closed". Toggle open: `/order` works normally.

- [ ] **Step 5: Commit**

```bash
git add src/app/order/page.tsx
git commit -m "feat: redirect /order to home when store is closed"
```

---

## Task 9: Redirect `/success` to home when store is closed

**Files:**
- Modify: `src/app/success/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/success/page.tsx`, add:

```tsx
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useStoreStatus } from "@/context/StoreStatusContext";
```

(If any of these are already imported, do not duplicate; only add the missing ones.)

- [ ] **Step 2: Add hook + redirect effect inside `SuccessContent`**

Inside the `SuccessContent` component, near the top of the function body (alongside the existing `useSearchParams` and `useState` calls), add:

```tsx
const router = useRouter();
const { open: storeOpen, loading: storeLoading } = useStoreStatus();

useEffect(() => {
  if (!storeLoading && !storeOpen) {
    message.info("Store is currently closed");
    router.replace("/");
  }
}, [storeLoading, storeOpen, router]);
```

`useEffect` is already imported. Place this effect before the existing `useEffect` that fetches the order.

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

Toggle store closed. Visit `/success?orderId=xxx`. Expected: redirect to `/` with toast.

- [ ] **Step 5: Commit**

```bash
git add src/app/success/page.tsx
git commit -m "feat: redirect /success to home when store is closed"
```

---

## Task 10: Redirect `/subscribe` to home when store is closed

**Files:**
- Modify: `src/app/subscribe/page.tsx`

- [ ] **Step 1: Add the import**

Add to the top of `src/app/subscribe/page.tsx`:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
```

(`useRouter`, `useEffect`, and antd `message` are already imported.)

- [ ] **Step 2: Add hook + redirect effect inside `SubscribeContent`**

Inside `SubscribeContent`, after the existing `useLoginPopup()` line and before the other state declarations, add:

```tsx
const { open: storeOpen, loading: storeLoading } = useStoreStatus();

useEffect(() => {
  if (!storeLoading && !storeOpen) {
    message.info("Store is currently closed");
    router.replace("/");
  }
}, [storeLoading, storeOpen, router]);
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual browser check**

Toggle store closed. Visit `/subscribe?productId=anything`. Expected: redirect to `/` with toast.

- [ ] **Step 5: Commit**

```bash
git add src/app/subscribe/page.tsx
git commit -m "feat: redirect /subscribe to home when store is closed"
```

---

## Task 11: "Store closed" banner on home (`/`) and menu (`/menu`)

**Files:**
- Create: `src/components/StoreClosedBanner.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/menu/page.tsx`

We extract a small banner component so the same markup is used on both pages.

- [ ] **Step 1: Create `StoreClosedBanner.tsx`**

Create `src/components/StoreClosedBanner.tsx` with:

```tsx
"use client";

import { useStoreStatus } from "@/context/StoreStatusContext";

export default function StoreClosedBanner() {
  const { open, loading } = useStoreStatus();
  if (loading || open) return null;
  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center">
      <p className="text-sm font-medium text-yellow-900">
        Store is currently closed — orders will resume soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add the banner to `src/app/page.tsx`**

Add the import alongside other component imports:

```tsx
import StoreClosedBanner from "@/components/StoreClosedBanner";
```

In the JSX, place the banner directly inside the `<main>` opening tag, before the `{/* Header */}` div:

```tsx
<main className="min-h-screen bg-white max-w-[430px] mx-auto overflow-hidden relative">
  <StoreClosedBanner />
  {/* Header */}
  <div className="flex justify-between items-center gap-2 mt-[20px] px-4">
    ...
```

- [ ] **Step 3: Add the banner to `src/app/menu/page.tsx`**

Add the import alongside other component imports:

```tsx
import StoreClosedBanner from "@/components/StoreClosedBanner";
```

In the JSX returned by the page (search for the outermost wrapper element rendered by the page-level component), place `<StoreClosedBanner />` as the first child so it appears at the very top of the page above any meal-card header or menu listing.

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 5: Manual browser check**

Toggle store closed via curl. Visit `/` — banner appears at top. Visit `/menu` — banner appears at top. Toggle open: banner disappears on both. While loading (slow throttled network), banner stays hidden (no flash).

- [ ] **Step 6: Commit**

```bash
git add src/components/StoreClosedBanner.tsx src/app/page.tsx src/app/menu/page.tsx
git commit -m "feat: show store-closed banner on home and menu pages"
```

---

## Task 12: Admin header toggle button

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Add imports**

Add to the top of `src/app/admin/layout.tsx`:

```tsx
import { useStoreStatus } from "@/context/StoreStatusContext";
import { message } from "antd";
```

- [ ] **Step 2: Add hook + click handler inside `AdminLayout`**

Inside the `AdminLayout` component, alongside the existing state/effect declarations (a good spot is right after the `audioRef`/`stopTimerRef` `useRef` lines), add:

```tsx
const {
  open: storeOpen,
  loading: storeLoading,
  setOpen: setStoreOpen,
} = useStoreStatus();
const [storeToggleBusy, setStoreToggleBusy] = useState(false);

const handleStoreToggle = async () => {
  if (storeToggleBusy || storeLoading) return;
  setStoreToggleBusy(true);
  const ok = await setStoreOpen(!storeOpen);
  setStoreToggleBusy(false);
  if (!ok) message.error("Failed to update store status");
  else message.success(`Store ${!storeOpen ? "opened" : "closed"}`);
};
```

(`useState` is already imported.)

- [ ] **Step 3: Add the toggle button to the nav**

In the `<nav>` block of the header, add this button element directly before the existing `<button onClick={handleLogout}>` button:

```tsx
<button
  type="button"
  onClick={handleStoreToggle}
  disabled={storeToggleBusy || storeLoading}
  className={`px-4 py-2 rounded-lg font-medium transition-colors text-white ${
    storeOpen
      ? "bg-[#024731] hover:bg-[#013a28]"
      : "bg-red-600 hover:bg-red-700"
  } ${storeToggleBusy || storeLoading ? "opacity-60 cursor-not-allowed" : ""}`}
>
  Store: {storeOpen ? "ON" : "OFF"}
</button>
```

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 5: Manual browser check**

Log into `/admin/menu`. Confirm the toggle appears in the header showing `Store: ON` (green). Click — it flips to `Store: OFF` (red), antd success toast shows. In another tab open `/menu`: ADD buttons hidden, banner visible. Click admin toggle again — `Store: ON` returns. Check `/order` redirect behavior in incognito.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: add store on/off toggle to admin header"
```

---

## Task 13: End-to-end manual verification

- [ ] **Step 1: Reset DB doc to a known starting state**

```bash
curl -X POST http://localhost:3000/api/admin/store-status -H "Content-Type: application/json" -d '{"open":true}'
```

- [ ] **Step 2: Run the full checklist**

With store ON:
- [ ] Visit `/` — no banner; layout normal.
- [ ] Visit `/menu` — ADD buttons visible.
- [ ] Add an item — `CartBar` appears.
- [ ] Tap `CartBar` → `/order` loads.
- [ ] Visit `/orders` — accessible.

Toggle from admin header to OFF. Refresh customer-side tabs:
- [ ] `/` — banner visible at top.
- [ ] `/menu` — banner visible; ADD buttons hidden.
- [ ] `CartBar` no longer visible (cart contents preserved in memory).
- [ ] Visit `/order` directly — redirects to `/` with antd toast.
- [ ] Visit `/success?orderId=test` — redirects to `/` with antd toast.
- [ ] Visit `/subscribe?productId=test` — redirects to `/` with antd toast.
- [ ] `/orders` (history) — still loads.

Toggle back ON. Refresh:
- [ ] All controls return to normal. Cart still has the item from before the close (memory state preserved).

- [ ] **Step 3: Run lint + build one final time**

```bash
npm run lint
npm run build
```
Expected: both succeed.

- [ ] **Step 4: No commit needed** — verification step only.

---

## Self-Review Checklist (run before handing off)

- [ ] Spec covers GET endpoint → Task 1.
- [ ] Spec covers POST endpoint → Task 2.
- [ ] Spec covers `StoreStatusContext` (open/loading/refresh/setOpen + 1h poll + default-true) → Task 3.
- [ ] Spec covers provider mount → Task 4.
- [ ] Spec covers MenuItem hide-control (incl. notch SVG) → Task 5.
- [ ] Spec covers RecommendedItem hide-plus → Task 6.
- [ ] Spec covers CartBar hide → Task 7.
- [ ] Spec covers `/order` redirect → Task 8.
- [ ] Spec covers `/success` redirect → Task 9.
- [ ] Spec covers `/subscribe` redirect → Task 10.
- [ ] Spec covers banner on `/` and `/menu` → Task 11.
- [ ] Spec covers admin header toggle → Task 12.
- [ ] Cart contents are NOT cleared when store closes (per spec) — Task 7 only hides the bar; cart memory untouched. ✓
- [ ] `/orders` history is NOT blocked (per spec) — no task touches it. ✓
- [ ] Default-open behavior on missing settings doc — Task 1 (`open = doc?.open ?? true`) and Task 3 (initial state `true`). ✓
- [ ] Type/property names consistent: hook returns `{ open, loading, refresh, setOpen }`. All consumer tasks destructure those exact names. ✓
