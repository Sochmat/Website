# Scheduled store open/close with admin-configurable hours

**Date:** 2026-07-14
**Status:** Approved

## Goal

Automatically open/close the store on a daily schedule (default: open 11:00, close
22:30 IST) so nobody has to remember to flip the manual toggle, while letting an
admin change the times and still override manually when needed.

## Approach: compute-on-read (no cron)

"Is the store open" is **derived live from the current IST time** vs the configured
window every time the app reads store state. No scheduled job, no host cron
dependency, cannot drift if a run is missed, and it reflects instantly. Chosen over
a cron-flips-a-flag design because the repo has no cron infrastructure and the
hosting target isn't pinned.

## Data model

Extend the existing `settings` collection document `{ key: "store" }` (currently
`{ key, open, updatedAt }`):

```
{
  key: "store",
  open: boolean,                // legacy manual flag — used only when schedule is OFF
  scheduleEnabled?: boolean,    // master switch for automatic hours (default: treat missing as false)
  openMinutes?: number,         // IST minutes since midnight, e.g. 660  = 11:00
  closeMinutes?: number,        // IST minutes since midnight, e.g. 1350 = 22:30
  overrideValue?: boolean | null,  // the state a manual tap forced
  overrideUntil?: Date | null,     // absolute instant the override expires (next boundary)
  updatedAt: Date,
}
```

The `delivery` document (`{ key: "delivery", on }`) is **out of scope** and unchanged.

## Effective-open computation

New shared helper `src/lib/storeState.ts`:

```
getEffectiveStoreOpen(storeDoc, now): { open: boolean, scheduleEnabled: boolean, opensAt?: Date }
```

Logic:
1. If `scheduleEnabled` is not `true` → `open = storeDoc.open ?? true` (today's behavior, fail-open).
2. Else compute `scheduledOpen`:
   - `nowMin = istMinutesOfDay(now)`
   - if `openMinutes < closeMinutes` → open when `openMinutes ≤ nowMin < closeMinutes`
   - if `openMinutes > closeMinutes` → open when `nowMin ≥ openMinutes || nowMin < closeMinutes` (window wraps midnight)
   - if equal → treat as open 24h
3. If `overrideUntil` is set and `now < overrideUntil` and `overrideValue != null` → `open = overrideValue`.
   Else → `open = scheduledOpen`.
4. `opensAt` = the next boundary at which the store becomes open (for the banner label); only meaningful when closed.

All three existing read points call this helper so the logic lives in exactly one place:
- `src/app/api/store-status/route.ts` (GET, public) — returns `{ success, open, delivery, opensAt? }`.
- `src/app/api/orders/route.ts` (POST) — 503 gate.
- `src/app/api/subscriptions/route.ts` (POST) — 503 gate.

## Manual override — "hold until next switch"

The existing header **Store ON/OFF** pill (`POST /api/admin/store-status`) keeps working, but
when `scheduleEnabled` is true it now writes an override instead of a permanent flag:
- `overrideValue = requestedOpen`
- `overrideUntil = nextBoundary(now, openMinutes, closeMinutes)` — the next open OR close time.

So force-closing at 20:00 keeps the store closed; at the next boundary (22:30 close, then
11:00 open) the schedule resumes and the override is spent. Force-opening at 02:00 keeps it
open until 11:00, after which the schedule (open) simply continues. No "resume" action needed.

When `scheduleEnabled` is false, the pill sets `open` exactly as today.

## IST helper (`src/lib/ist.ts`, new)

IST is a fixed UTC+5:30 (no DST), so these are exact:
- `istMinutesOfDay(now: Date): number` — IST hour*60 + minute, via `Intl.DateTimeFormat`
  `formatToParts` with `timeZone: "Asia/Kolkata"` (mirrors the existing pattern in
  `src/lib/petpooja.ts`).
- `nextBoundary(now: Date, openMinutes: number, closeMinutes: number): Date` — the nearest
  future instant at which either boundary occurs, as an absolute `Date`. Computed by mapping
  an IST wall-clock minute on the current IST date to UTC (`- 330 min`) and rolling forward a
  day until it is after `now`.

## Admin UI — new "Store Hours" page

New page `src/app/admin/store-hours/page.tsx` (admin-only; add a "Store Hours" link to the
admin header nav in `src/app/admin/layout.tsx`):
- **Enable automatic hours** checkbox (`scheduleEnabled`).
- **Open** and **Close** `<input type="time">` fields, pre-filled `11:00` / `22:30`
  (converted to/from minutes-since-midnight).
- A live readout: "Currently OPEN / CLOSED — reopens at 11:00 AM" computed from the same helper.
- **Save** → new `POST /api/admin/store-schedule` with `{ scheduleEnabled, openMinutes, closeMinutes }`,
  upserting the `store` doc. Saving does not clear an active override; enabling for the first
  time simply activates the schedule.

## Customer-facing

No changes to gating components — they already read `useStoreStatus()`. Improvement: when
closed and `opensAt` is present, `StoreClosedBanner` shows "Store is closed — opens at 11:00 AM"
instead of the generic message (falls back to generic when `opensAt` is absent).

## Propagation

`StoreStatusContext` currently polls `/api/store-status` every 1 hour. Reduce
`POLL_INTERVAL_MS` to ~5 minutes so an open customer tab reflects an auto open/close within
minutes. The server-side 503 gate enforces immediately regardless of client poll, so a stale
tab can never place an order after close.

## Safety / rollout

- Missing schedule config ⇒ `scheduleEnabled` treated as false ⇒ behavior identical to today
  (fail-open, manual only). No behavior change until an admin enables + saves.
- The Store Hours form is pre-filled with 11:00 / 22:30 and enabled, so activation is one Save.

## Testing / verification

- Unit-style checks (runnable script, since vitest isn't installed) for `istMinutesOfDay`,
  the wrap-around window logic in `getEffectiveStoreOpen`, and `nextBoundary` (including the
  override-expiry instants).
- Drive the real app: enable the schedule, set a window around "now", confirm the menu shows
  ADD buttons / the closed banner accordingly and that `/api/orders` returns 503 when closed;
  confirm a manual override holds until the next boundary.
