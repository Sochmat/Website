# Browser-based KOT / Bill printing — retire the Python print agent

**Date:** 2026-07-15
**Status:** Design approved, ready for implementation plan

## Problem

Today a separate Python program (`tools/kot-print-agent/print_agent.py`) runs on
the shop's Windows PC next to the thermal printer. It polls the deployed site
(`GET /api/print/kot`, `GET /api/print/bill`), renders each ticket as an ESC/POS
image, prints it to the local `POS-80` printer, then acks the server
(`POST /api/print/*`) so it is not reprinted.

Running and maintaining a separate Python process (Python install, venv,
`requirements.txt`, Task Scheduler / `run.bat`, a shared `PRINT_AGENT_TOKEN`) is
operational overhead. We want printing to happen **from the website itself** —
specifically from the admin orders page already open in the browser on the shop
PC, which is the only thing on the shop's network that can reach the printer.

## Goal

Eliminate the Python agent. The admin orders page, running in Chrome on the shop
PC and marked as the **Print Station**, renders KOTs and bills as HTML sized for
80 mm thermal paper, prints them with `window.print()`, then acks the server so
nothing reprints. Behaviour visible to shop staff is unchanged: accepting an
order auto-prints its KOT; clicking "Print Bill" prints the bill.

## Constraints & context

- The thermal printer is **physically wired to the shop PC**; the site is
  deployed remotely. Printing therefore must run client-side in the shop PC's
  browser — the browser is the bridge to the printer.
- `/api/admin/*` is already gated behind the admin session cookie
  (`src/middleware.ts`, `src/lib/adminAuth.ts`). The browser holds that cookie,
  so no bearer token is needed for browser-initiated printing.
- The admin orders page (`src/app/admin/orders/page.tsx`) already polls
  `GET /api/admin/orders` on an interval and receives **full order documents**
  (spread `...order`) plus enriched product names — including `orderItems`
  (`quantity`, `price`, `variantName?`, `addOns[]`), `receiver`, `tax`,
  `discountAmount`, `deliveryFee`, `totalAmount`, `kotNumber`, `billNumber`,
  `kotPrinted`, `billRequested`, `billPrinted`. **No new data fetch is required
  for rendering.**
- KOT/bill numbering and queue flags are unchanged — still assigned server-side
  in `PATCH /api/admin/orders` (`src/lib/kotCounter.ts`). This design only
  changes *who renders and prints* (browser instead of Python) and *how acks are
  authenticated* (admin cookie instead of `PRINT_AGENT_TOKEN`).

## Approach chosen

- **Print mechanism:** Browser print dialog — render tickets as HTML/CSS sized
  for 80 mm and call `window.print()`, using the printer's Windows driver.
  (Rejected: WebUSB/Web Serial ESC/POS — silent but Chrome-only, per-device
  permission, driver-finicky. Rejected: a local Node helper — still a separate
  process, defeats the goal.)
- **Trigger:** Auto-print on a designated **Print Station** (a per-browser
  toggle). Only that tab prints, mirroring the single Python agent today.
- **Shop details:** Read from **server env vars**, exposed to the admin page via
  a small admin-authed config endpoint.

## Components

### 1. Shop config (`src/lib/shopConfig.ts` + `GET /api/admin/print-config`)

`shopConfig.ts` reads the bill/KOT shop fields from server env vars (same names
as the Python `.env`):

- `SHOP_NAME` (default `"SOCHMAT"`) — KOT header
- `ORDER_SOURCE` (default `"Website"`) — "From: …" line
- `SHOP_LEGAL_NAME` — bill header
- `GST_NO`, `FSSAI_NO` — KOT footer + bill header
- `SHOP_CONTACT`, `SHOP_ADDRESS` — bill footer
- `CASHIER` (default `"biller"`) — bill

`GET /api/admin/print-config` (admin-session gated by existing middleware)
returns these as JSON. The orders page fetches it once on mount (or the Print
Station fetches it when enabled) and caches it in state. Values are non-secret
shop identity fields, safe to hand to the admin browser.

### 2. Print rendering (`src/lib/print/`)

Port the two Python renderers to TypeScript that produce **HTML strings** for an
80 mm receipt. Split pure calculation from markup so the math is unit-testable:

- `src/lib/print/receiptModel.ts` — pure functions that transform an order +
  shop config into a normalized ticket model. Ports the Python arithmetic:
  - Add-on price split: `basePrice = item.price - Σ(addOn.price × addOn.qty)`;
    each add-on prints as its own priced row; add-on qty scales with dish qty.
  - Tax halves: `cgst = round(tax/2, 2)`, `sgst = round(tax - cgst, 2)`.
  - Round-off: `grand - (sub - discount + delivery + cgst + sgst)`, shown only
    if `|round_off| >= 0.01`.
  - Totals, total-qty, paid/unpaid state, IST timestamp formatting
    (`dd/mm/yy HH:MM`, Asia/Kolkata).
- `src/lib/print/renderKot.ts` — KOT HTML (ports `render_lines`): From/source,
  shop name, timestamp, `KOT - <n>` (emphasised), order id, method, item rows
  with wrapped names + qty, variant, add-on rows, payment, customer, total,
  FSSAI/GST footer.
- `src/lib/print/renderBill.ts` — bill HTML (ports `render_bill_lines`):
  PAID/UNPAID, legal name, GST/FSSAI, customer block, date/cashier/bill-no,
  itemised rows with base + add-on prices, sub-total, discount, delivery, CGST,
  SGST, round-off, grand total, total qty, payment line, contact/address footer,
  "Thanks for Ordering….!!".

Styling: a shared `receipt.css` (or inline `<style>`) with a monospace font,
`@page { size: 80mm auto; margin: 0 }`, small font size, tight line-height, black
on white. Emphasised lines (shop name, KOT number) are bold/larger. The Python
version rendered to a bitmap to control font size; HTML gives us adjustable font
sizing natively, so no image rendering is needed.

### 3. Print Station mechanism (in `src/app/admin/orders/page.tsx`, helper in `src/lib/print/printStation.ts`)

- A **Print Station** toggle in the orders page toolbar, persisted in
  `localStorage` (e.g. `sochmat.printStation = "1"`). Off by default so ordinary
  admins never print. A visible indicator shows when the current tab is the
  active station.
- When ON, on each existing orders poll the tab computes the print queues from
  the already-fetched orders:
  - **KOT queue:** `status === "confirmed" && kotPrinted !== true`
  - **Bill queue:** `billRequested === true && billPrinted !== true`
- Print **one ticket at a time** (a small async queue): render HTML → inject into
  a hidden same-origin `<iframe>` → call the iframe's `contentWindow.print()` →
  on return, `await` the ack → move to the next. Serializing avoids overlapping
  print dialogs and interleaved output.
- **In-flight guard:** a `Set` of order ids currently being printed/acked, so a
  slow ack (or the next poll arriving mid-print) cannot double-queue the same
  ticket. This reproduces the Python agent's "print, then ack; if ack fails it
  may reprint once next poll" semantics — acceptable and intentionally simple.
- KOT and bill are independent: an order can be in the bill queue (reprint) even
  after its KOT printed.

Hidden-iframe approach is used instead of `window.print()` on the main document
so the visible admin UI is not what gets printed — only the receipt HTML in the
iframe is.

### 4. Ack endpoint (extend `PATCH /api/admin/orders`)

Add two optional flags to the existing admin-authed PATCH handler:

- `markKotPrinted: true` → `$set { kotPrinted: true, kotPrintedAt: new Date() }`
- `markBillPrinted: true` → `$set { billPrinted: true, billRequested: false,
  billPrintedAt: new Date() }`

These mirror exactly what the old `POST /api/print/kot` and
`POST /api/print/bill` did, but authenticated by the admin cookie. They are
additive and independent of the existing status/paymentStatus/printBill/reject
branches. (Alternative considered: a separate `POST /api/admin/print-ack`;
folding into the existing PATCH keeps the order-mutation surface in one place.)

### 5. Retire the old path

Delete:

- `tools/kot-print-agent/` (whole folder: `print_agent.py`, `requirements.txt`,
  `run.bat`, `README.md`).
- `src/app/api/print/kot/route.ts` and `src/app/api/print/bill/route.ts` (and the
  now-empty `src/app/api/print/` dir).
- `PRINT_AGENT_TOKEN` references (the two route files; the middleware exemption
  for `/api/print/` in `src/middleware.ts` can be removed since no `/api/print/*`
  route remains).

Update the middleware `/api/print/` public-exemption note accordingly. Nothing
else references these routes.

## Operational notes (documented, not code)

- `window.print()` shows a dialog each time. For hands-free operation the shop PC
  runs Chrome with `--kiosk-printing`, which prints silently to the **default
  printer** with no dialog. Set the default printer to the 80 mm thermal printer
  and its paper size to 80 mm roll. This replaces the Task Scheduler / `run.bat`
  autostart of the Python agent — instead, autostart Chrome (kiosk-printing) to
  the admin orders URL and enable Print Station once on that browser.
- A **Test print** button (Print Station only) renders a sample KOT + bill (the
  Python `SAMPLE_TICKET` / `SAMPLE_BILL` fixtures) so layout can be verified
  without a real order — the analog of `python print_agent.py --test`.

## Testing

- **Unit (Vitest):** `receiptModel.ts` pure functions — add-on price split, tax
  halves, round-off (including the `< 0.01` suppression), total-qty, paid/unpaid,
  IST timestamp formatting. Use the ported `SAMPLE_TICKET` / `SAMPLE_BILL`
  fixtures and assert the derived numbers match the Python output.
- **Manual:** Test-print button → visually compare KOT and bill against the
  current Python `--dry-run` / printed output at 80 mm; confirm one-at-a-time
  serialized printing and no double-prints across two consecutive polls.

## Out of scope

- No change to KOT/bill numbering, queue flags, or the accept/reject/refund flow.
- No WebUSB/ESC/POS silent printing (relying on kiosk-printing instead).
- No admin UI to edit shop details (env vars only; a settings page is a possible
  future enhancement).

## File-change summary

**New**
- `src/lib/shopConfig.ts`
- `src/app/api/admin/print-config/route.ts`
- `src/lib/print/receiptModel.ts`
- `src/lib/print/renderKot.ts`
- `src/lib/print/renderBill.ts`
- `src/lib/print/printStation.ts` (queue + iframe print helper)
- `src/lib/print/receipt.css` (or inline styles)
- `src/lib/print/receiptModel.test.ts`

**Modified**
- `src/app/admin/orders/page.tsx` — Print Station toggle, print loop, Test print.
- `src/app/api/admin/orders/route.ts` — `markKotPrinted` / `markBillPrinted`.
- `src/middleware.ts` — drop the `/api/print/` exemption note/branch.

**Deleted**
- `tools/kot-print-agent/` (folder)
- `src/app/api/print/kot/route.ts`
- `src/app/api/print/bill/route.ts`
