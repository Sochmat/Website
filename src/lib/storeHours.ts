/**
 * Day-wise store opening hours.
 *
 * Seven days, each holding zero or more same-day open windows, so a kitchen can
 * run a lunch and a dinner service with a break between and vary them by day.
 * A day with no windows is closed outright.
 *
 * Windows never wrap past midnight: `close` is always greater than `open`. That
 * keeps "is the store open now" a lookup on today's row alone, with no need to
 * consult yesterday's for a spillover. `close` may be 1440 (midnight tonight);
 * `open` may not, since a window starting at midnight belongs to the next day.
 *
 * Every function assumes each day's windows are sorted by `open` and do not
 * overlap — the invariant `normalizeWeeklyHours` establishes at the API edge.
 *
 * Like `ist.ts` and `societySlots.ts`, nothing here reads the clock — callers
 * inject `now`, keeping every function pure and unit-testable.
 */

import {
  istMinutesOfDay,
  istToday,
  istWeekdayIndex,
  istInstant,
  formatMinutesLabel,
  weekdayName,
  addIstDays,
} from "./ist";

/** A same-day open window, in IST minutes since midnight. `close > open`. */
export interface StoreWindow {
  open: number;
  close: number;
}

/** Exactly 7 entries, index 0 = Sunday … 6 = Saturday. */
export type WeeklyHours = StoreWindow[][];

export const DAYS_IN_WEEK = 7;

/** A week with every day closed — the identity value for the editor. */
export function emptyWeek(): WeeklyHours {
  return Array.from({ length: DAYS_IN_WEEK }, () => []);
}

/** The same window every day, used to seed the editor from the legacy pair. */
export function uniformWeek(open: number, close: number): WeeklyHours {
  return Array.from({ length: DAYS_IN_WEEK }, () => [{ open, close }]);
}

/** Whether any day has at least one window. An all-closed week never opens. */
export function hasAnyWindow(weekly: WeeklyHours): boolean {
  return weekly.some((day) => day.length > 0);
}

/** The windows that apply on the IST day `now` falls in. */
export function windowsForNow(weekly: WeeklyHours, now: Date): StoreWindow[] {
  return weekly[istWeekdayIndex(istToday(now))] ?? [];
}

/**
 * Whether the store is open at `now`. `open` is inclusive and `close` exclusive,
 * so a window ending at 15:00 is shut at exactly 15:00.
 */
export function isOpenAt(weekly: WeeklyHours, now: Date): boolean {
  const mins = istMinutesOfDay(now);
  return windowsForNow(weekly, now).some(
    (w) => mins >= w.open && mins < w.close,
  );
}

/**
 * When the store next opens, strictly after `now`. Scans today's remaining
 * windows then each following day, up to a full week. Null when every day is
 * closed — there is no next opening to point at.
 */
export function nextOpenAt(weekly: WeeklyHours, now: Date): Date | null {
  if (!hasAnyWindow(weekly)) return null;

  const nowMins = istMinutesOfDay(now);
  let date = istToday(now);

  for (let ahead = 0; ahead <= DAYS_IN_WEEK; ahead++) {
    const windows = weekly[istWeekdayIndex(date)] ?? [];
    for (const w of windows) {
      // Only today's windows can be partly behind us.
      if (ahead > 0 || w.open > nowMins) {
        return istInstant(date, Math.floor(w.open / 60), w.open % 60);
      }
    }
    date = addIstDays(date, 1);
  }
  return null;
}

/**
 * The next instant the schedule changes state — an opening or a closing —
 * strictly after `now`. This is what bounds a manual override: the tap holds
 * until the schedule would next have moved on its own.
 *
 * Null when every day is closed, leaving the caller to pick its own fallback.
 */
export function nextBoundaryFrom(
  weekly: WeeklyHours,
  now: Date,
): Date | null {
  if (!hasAnyWindow(weekly)) return null;

  const nowMins = istMinutesOfDay(now);
  let date = istToday(now);

  for (let ahead = 0; ahead <= DAYS_IN_WEEK; ahead++) {
    const windows = weekly[istWeekdayIndex(date)] ?? [];
    for (const w of windows) {
      for (const edge of [w.open, w.close]) {
        if (ahead > 0 || edge > nowMins) {
          return istInstant(date, Math.floor(edge / 60), edge % 60);
        }
      }
    }
    date = addIstDays(date, 1);
  }
  return null;
}

/**
 * A human label for the next opening, e.g. "11:00 AM", "tomorrow at 11:00 AM",
 * or "Monday at 11:00 AM". Null when the store never opens.
 */
export function nextOpenLabel(
  weekly: WeeklyHours,
  now: Date,
): string | null {
  const at = nextOpenAt(weekly, now);
  if (!at) return null;

  const time = formatMinutesLabel(istMinutesOfDay(at));
  const today = istToday(now);
  const day = istToday(at);
  if (day === today) return time;
  if (day === addIstDays(today, 1)) return `tomorrow at ${time}`;
  return `${weekdayName(istWeekdayIndex(day))} at ${time}`;
}

function isMinute(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

/**
 * Validate and canonicalise a weekly schedule from untrusted input.
 *
 * Returns the normalised value, or a message naming the offending day. Windows
 * are sorted by start time; overlaps are **rejected** rather than merged, so a
 * mistyped second window is reported instead of being quietly absorbed into the
 * first.
 */
export function normalizeWeeklyHours(
  raw: unknown,
): { ok: true; value: WeeklyHours } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length !== DAYS_IN_WEEK) {
    return { ok: false, message: "Schedule must cover all 7 days." };
  }

  const result: WeeklyHours = [];
  for (let i = 0; i < DAYS_IN_WEEK; i++) {
    const day = raw[i];
    const label = weekdayName(i);
    if (!Array.isArray(day)) {
      return { ok: false, message: `${label}: expected a list of windows.` };
    }

    const windows: StoreWindow[] = [];
    for (const w of day) {
      const open = (w as StoreWindow)?.open;
      const close = (w as StoreWindow)?.close;
      // `close` may be 1440 — midnight tonight — so "open till midnight" is
      // expressible without settling for 23:59.
      if (!isMinute(open, 1439) || !isMinute(close, 1440)) {
        return {
          ok: false,
          message: `${label}: times must be within the day.`,
        };
      }
      if (close <= open) {
        return {
          ok: false,
          message: `${label}: a window must close after it opens (windows can't run past midnight).`,
        };
      }
      windows.push({ open, close });
    }

    windows.sort((a, b) => a.open - b.open);
    for (let j = 1; j < windows.length; j++) {
      if (windows[j].open < windows[j - 1].close) {
        return { ok: false, message: `${label}: windows overlap.` };
      }
    }
    result.push(windows);
  }

  return { ok: true, value: result };
}
