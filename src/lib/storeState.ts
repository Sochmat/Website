import { istMinutesOfDay, formatMinutesLabel } from "./ist";
import { isOpenAt, nextOpenLabel, type WeeklyHours } from "./storeHours";

// Default hours if the schedule is enabled but times were never set.
export const DEFAULT_OPEN_MINUTES = 11 * 60; // 11:00
export const DEFAULT_CLOSE_MINUTES = 22 * 60 + 30; // 22:30

/** The persisted `settings` document for `{ key: "store" }`. */
export interface StoreSettingsDoc {
  open?: boolean; // manual flag — used only when the schedule is OFF
  scheduleEnabled?: boolean;
  openMinutes?: number; // IST minutes since midnight
  closeMinutes?: number;
  /**
   * Day-wise hours, 7 entries from Sunday. When present it supersedes the
   * openMinutes/closeMinutes pair above.
   *
   * The legacy pair is deliberately left in place rather than migrated: it
   * permits a window that wraps past midnight, which the day-wise model has no
   * faithful representation for, and a lossy auto-conversion is exactly the
   * kind of thing that silently reopens a store at 1am. Installations keep the
   * old behaviour byte for byte until someone saves on the new admin page.
   */
  weeklyHours?: WeeklyHours;
  overrideValue?: boolean | null; // state a manual tap forced
  overrideUntil?: Date | string | null; // when that override expires
}

export interface EffectiveStore {
  open: boolean;
  scheduleEnabled: boolean;
  scheduledOpen: boolean;
  overrideActive: boolean;
  /** For the closed banner — only set when closed purely by the schedule. */
  opensAtLabel: string | null;
}

/** Is `nowMin` inside the [open, close) window, handling windows that wrap midnight? */
export function isWithinWindow(
  nowMin: number,
  openMin: number,
  closeMin: number,
): boolean {
  if (openMin === closeMin) return true; // degenerate → open 24h
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin; // wraps past midnight
}

/**
 * The single source of truth for "is the store open right now". Every read path
 * (public status endpoint + the order/subscription 503 gates) goes through here.
 *
 * - schedule off → the legacy manual `open` flag (fail-open when unset).
 * - schedule on  → derived from the current IST time vs the window, unless a
 *   manual override is still in effect (holds until its boundary instant).
 */
export function getEffectiveStoreOpen(
  store: StoreSettingsDoc | null | undefined,
  now: Date,
): EffectiveStore {
  if (store?.scheduleEnabled !== true) {
    const open = store?.open ?? true;
    return {
      open,
      scheduleEnabled: false,
      scheduledOpen: open,
      overrideActive: false,
      opensAtLabel: null,
    };
  }

  const weekly = store.weeklyHours;
  const openMin = store.openMinutes ?? DEFAULT_OPEN_MINUTES;
  const closeMin = store.closeMinutes ?? DEFAULT_CLOSE_MINUTES;
  const scheduledOpen = weekly
    ? isOpenAt(weekly, now)
    : isWithinWindow(istMinutesOfDay(now), openMin, closeMin);

  let open = scheduledOpen;
  let overrideActive = false;
  const until = store.overrideUntil ? new Date(store.overrideUntil) : null;
  if (
    until &&
    until.getTime() > now.getTime() &&
    typeof store.overrideValue === "boolean"
  ) {
    open = store.overrideValue;
    overrideActive = true;
  }

  return {
    open,
    scheduleEnabled: true,
    scheduledOpen,
    overrideActive,
    // Only advertise the reopen time when the closure is the plain schedule —
    // an override-driven closure reopens at its own boundary, so stay generic.
    // Under day-wise hours the next opening may not be today, so the label can
    // read "tomorrow at 11:00 AM" or "Monday at 11:00 AM"; it stays a plain
    // string, so every consumer of this field is unaffected.
    opensAtLabel:
      !open && !overrideActive
        ? weekly
          ? nextOpenLabel(weekly, now)
          : formatMinutesLabel(openMin)
        : null,
  };
}
