// IST (Asia/Kolkata) time helpers. IST is a fixed UTC+5:30 with no DST, so all
// of these are exact arithmetic — no timezone database lookups at call time
// beyond reading the current wall-clock, which uses Intl.

const IST_OFFSET_MIN = 330; // +05:30

/** Current IST time-of-day as minutes since midnight (0–1439). */
export function istMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** The UTC instant of 00:00 IST on the IST calendar date that `now` falls on. */
function istMidnightUtcMs(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  // Midnight IST = that UTC date at 00:00 minus the +5:30 offset.
  return Date.UTC(y, mo - 1, d) - IST_OFFSET_MIN * 60_000;
}

/** The absolute instant at which IST wall-clock next reads `minute` (0–1439), strictly after `now`. */
export function nextInstantAtIstMinute(now: Date, minute: number): Date {
  const base = istMidnightUtcMs(now);
  for (let day = 0; day <= 1; day++) {
    const t = base + day * 86_400_000 + minute * 60_000;
    if (t > now.getTime()) return new Date(t);
  }
  // minute is earlier today than now and also (impossibly) tomorrow — fall back.
  return new Date(base + 2 * 86_400_000 + minute * 60_000);
}

/** The next open/close boundary instant strictly after `now`. */
export function nextBoundary(
  now: Date,
  openMinutes: number,
  closeMinutes: number,
): Date {
  const a = nextInstantAtIstMinute(now, openMinutes);
  const b = nextInstantAtIstMinute(now, closeMinutes);
  return a.getTime() <= b.getTime() ? a : b;
}

/** Format minutes-since-midnight as a 12h label, e.g. 660 → "11:00 AM". */
export function formatMinutesLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/** "HH:MM" (24h) → minutes since midnight. Returns null if malformed. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since midnight → "HH:MM" (24h), for <input type="time"> values. */
export function toHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
