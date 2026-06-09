# Petpooja `saveorder` Push — Design

**Date:** 2026-06-10
**Status:** Approved

## Goal

Push each placed order to the Petpooja POS via the `/saveorder` endpoint so the
restaurant kitchen receives online orders. Scope is the **outbound push only**.

## Decisions

- **Endpoints:** `saveorder` (push) only. `callback` (inbound status) and
  `orderstatus` (cancel) are out of scope.
- **Trigger:** push after payment is confirmed. Online orders push from
  `verify-order` once `paymentStatus = paid`; COD (`paymentMethod = "cash"`)
  orders push at creation in `POST /api/orders`.
- **Item mapping:** add an optional `petpoojaItemId` to `MenuItem`. Orders with
  any unmapped item are **not** pushed (flagged instead).
- **Config:** Petpooja credentials live in env vars.
- **Push failure:** record and alert; never block the customer. The order stays
  valid; failure is recorded on the order for admin to handle manually.
- **Missing item id:** skip the push entirely and flag the order. No partial push.

## 1. Configuration (env vars)

Following the Razorpay/SMTP pattern in `.env` / `.env.local`:

```
PETPOOJA_APP_KEY
PETPOOJA_APP_SECRET
PETPOOJA_ACCESS_TOKEN
PETPOOJA_REST_ID
PETPOOJA_SAVE_ORDER_URL   # default: https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order
```

If any auth var is missing, the push is a no-op recording
`petpoojaStatus: "skipped"` (reason: not configured), so the app works before
credentials arrive.

## 2. Type changes (`src/lib/types.ts`)

- `MenuItem`: add `petpoojaItemId?: string`.
- `Order`: add push-tracking fields:
  - `petpoojaStatus?: "success" | "failed" | "skipped"`
  - `petpoojaOrderId?: string` — Petpooja's returned id (for future cancel/callback)
  - `petpoojaError?: string`
  - `petpoojaPushedAt?: Date`

## 3. New module `src/lib/petpooja.ts`

`pushOrderToPetpooja(order, db)` → `{ status, petpoojaOrderId?, error? }`.
**Never throws.**

1. Verify config present; if not → `{ status: "skipped", error: "not configured" }`.
2. Load the order's menu items, build `productId → { petpoojaItemId, name, price }`.
3. If any item lacks `petpoojaItemId` → `{ status: "skipped", error: "unmapped items: …" }`.
4. Build the `/saveorder` payload:
   - `Restaurant.details.restID` = `PETPOOJA_REST_ID`; res_name/address/contact constants.
   - `Customer.details` from `order.receiver` (name, phone, address).
   - `Order.details`: `orderID` = `order.orderNumber`, `order_type: "H"`,
     `payment_type` (cash → `COD`, else → `ONLINE`), `total` = `netAmount`,
     `preorder_date`/`preorder_time`/`created_on` from `createdAt`,
     `description` from notes.
   - `OrderItem.details`: one per item — `id` = petpoojaItemId, `name`, `price`,
     `quantity`, `final_price`, `item_tax: []`, `item_discount: "0"`.
   - Required charge fields (`service_charge`, `sc_tax_amount`, `dc_tax_*`,
     `pc_tax_*`) sent as `"0"`. `discount_total`/`tax_total` carry our flat values.
5. POST with `app_key/app_secret/access_token`. Parse response:
   `success === "1"` → success with `petpoojaOrderId`; else `failed` with message.
   Network errors → `failed`.

### Known limitation

Petpooja's per-item tax/charge breakdown is not reproduced — our order model
stores only flat `tax`/`discountAmount`/`deliveryFee`. Charge fields are sent as
zero. Exact tax parity requires the Push-Menu tax sync (out of scope).

## 4. Trigger points

- **Online:** `verify-order/route.ts`, after flipping the orders branch to
  `paid`, call the push and `$set` the `petpooja*` fields. Do not push for the
  subscriptions branch.
- **COD:** `POST /api/orders`, after insert, if `paymentMethod === "cash"`, push
  and update the order.
- Both wrap the push so failure never blocks the customer response.

## 5. Out of scope (later)

`/callback` (inbound status), `/orderstatus` (cancel), Push-Menu/tax sync,
auto-retry, and admin UI for setting `petpoojaItemId` / viewing push status.
