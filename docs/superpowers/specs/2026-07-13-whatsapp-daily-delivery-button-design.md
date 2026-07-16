# WhatsApp button on today's subscription deliveries

**Date:** 2026-07-13
**Status:** Approved (pending spec review)

## Goal

Give admins a one-click way to message a subscription customer on WhatsApp — from the
admin's own WhatsApp number — about the meal that customer is receiving today. This
speeds up the daily "your food is on its way" outreach without leaving the admin panel.

## Scope

- **In scope:** A per-delivery WhatsApp button on the **"Daily deliveries"** tab of the
  subscription-plans admin page.
- **Out of scope (for now):** the "All plans" tab, the legacy `subscriptions` page,
  à-la-carte orders, automated/templated sending via Kaleyra (`src/lib/notify.ts` stays
  untouched), and any bulk / send-to-all feature.

## Approach

Click-to-chat via `wa.me` — a plain anchor link, **no backend, no API keys, no new
dependencies, no per-message cost.** Clicking opens WhatsApp (web or app) on the admin's
machine with the customer's number selected and the message pre-filled. The admin reviews
and presses send themselves (so the message can also be edited before sending).

This was chosen over the WhatsApp Business API (which would require a WhatsApp Business
account, Meta/Kaleyra template approval, API credentials, and cost per message) because
the manual click-to-send flow meets the need today at zero setup and zero cost.

## Where

File: `src/app/admin/subscription-plans/page.tsx`

The "Daily deliveries" tab renders one card per `Delivery` (lines ~180–218). The action
area is the `<div className="text-right">` block at lines ~201–216, which already holds
the protein/time labels and the "Mark delivered" / "Editable until 12:00" controls. The
WhatsApp button is added inside this block, below the existing controls.

At that point in scope: `d.receiver.name`, `d.receiver.phone`, `d.itemName`, and
`d.deliveryTime`.

## Behaviour

### Phone number

Stored phone numbers are **bare 10 digits** (no country code). To build the link:

1. Sanitize: `d.receiver.phone.replace(/\D/g, "")`.
2. Require exactly 10 digits. If not 10 digits (missing/malformed), the button is
   **rendered disabled** (grayed out, not clickable) rather than producing a broken link.
3. Prefix `91` (India), matching existing `wa.me/91…` usage in
   `src/components/OrderPromptModal.tsx`.

Resulting link: `https://wa.me/91<10-digit-phone>?text=<url-encoded-message>`, opened with
`target="_blank"` and `rel="noopener noreferrer"`.

### Message (friendly "on its way")

Base template:

> Hi {name}! 😊 Your Sochmat meal for today — *{item}* — is being prepared and will reach
> you around {time}. Thank you!

Fallbacks:
- No `name` → "Hi! 😊 Your Sochmat meal …"
- No `itemName` → use "your meal" in place of "*{item}*".
- No `deliveryTime` → drop the " around {time}" clause entirely (sentence still reads
  correctly: "… is being prepared and will reach you today. Thank you!").

The message string is built once per card and passed through `encodeURIComponent` for the
`?text=` parameter.

### Appearance

- Green button (WhatsApp brand color), label **"WhatsApp"** with a small WhatsApp glyph,
  styled consistently with the existing small buttons in the card (same sizing as the
  "Mark delivered" button: `mt-1 text-xs … px-2 py-1 rounded-lg`).
- Disabled state (invalid phone): grayed background, `cursor-not-allowed`, not a link.

## Implementation notes

- Pure client-side change in one file. No API route, type, or backend change.
- A small helper to build the message text and the sanitized phone keeps the JSX readable
  (can be a local function/const in the component).
- No test infrastructure exists for these admin pages; verification is manual (see below).

## Verification

Manual, on the "Daily deliveries" tab:
1. A delivery with a valid 10-digit phone shows an enabled green WhatsApp button; clicking
   opens WhatsApp to `wa.me/91<phone>` with the pre-filled message containing the correct
   name, item, and time.
2. A delivery missing the item or delivery time renders the button with the correct
   fallback message (no broken "undefined" text).
3. A delivery with a missing/short phone shows the button disabled.
