/**
 * Asia/Kolkata date math.
 *
 * India has had a fixed UTC+05:30 offset with no DST since 1945, so every
 * conversion here is plain arithmetic — no `Intl.DateTimeFormat`.
 *
 * Two representations, used consistently across the subscription code:
 *   - an **IST calendar date** is a `yyyy-mm-dd` string. It is what a "delivery
 *     day" *is*, and lexicographic compare equals chronological compare.
 *   - an **instant** is a `Date` (UTC epoch). Used for `now`, cutoffs, expiry.
 *
 * No function here reads the clock. Callers inject `now`, which keeps every
 * consumer pure and unit-testable.
 */

export const IST_OFFSET_MIN = 330; // UTC+05:30

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** The IST calendar date (yyyy-mm-dd) that `instant` falls on. */
export function toIstDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MIN * MS_PER_MIN)
    .toISOString()
    .slice(0, 10);
}

/** The instant at `hour:minute` IST on the given IST calendar date. */
export function istInstant(date: string, hour: number, minute: number): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MIN * MS_PER_MIN);
}

/** Today's IST calendar date. */
export function istToday(now: Date): string {
  return toIstDate(now);
}

/** Calendar arithmetic on yyyy-mm-dd. No timezone is involved. */
export function addIstDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole IST days from `from` to `to`. Negative when `to` precedes `from`. */
export function istDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY,
  );
}

/** "Monday" … "Sunday" for an IST calendar date. */
export function istWeekday(date: string): string {
  const [y, m, d] = parts(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
