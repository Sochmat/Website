import { addIstDays, istDaysBetween, istInstant, istToday, istWeekday } from "./ist";
import { CREDIT_VALIDITY_DAYS } from "./subscriptionBrackets";
import type { SubscriptionCredit, SubscriptionMealPlan } from "./types";

/**
 * Fallback freeze hour for a delivery whose `deliveryTime` is missing or
 * unparseable (legacy plans, blank payloads). Live plans lock relative to their
 * own delivery time — see {@link deliveryCutoffAt}.
 */
export const DELIVERY_CUTOFF_HOUR_IST = 12;
/**
 * The kitchen needs this many hours of prep before a delivery, so a day's
 * credit freezes `KITCHEN_LEAD_HOURS` before the customer's chosen delivery
 * time (e.g. a 12:00 slot locks at 09:00 IST, a 21:00 slot at 18:00).
 */
export const KITCHEN_LEAD_HOURS = 3;
/** The next day's suggestion appears at 20:00 IST the evening before. */
export const SUGGESTION_HOUR_IST = 20;
/**
 * Extra hours of notice on top of the kitchen lead. 0 means a customer may edit
 * right up until the `KITCHEN_LEAD_HOURS` cutoff. Raise this to push the last
 * bookable moment earlier without touching any logic.
 */
export const MIN_LEAD_HOURS = 0;

const MS_PER_HOUR = 3_600_000;

/** Parse an "HH:mm" IST delivery slot. Returns null when absent or malformed. */
function parseHhMm(deliveryTime?: string): { hour: number; minute: number } | null {
  if (!deliveryTime) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(deliveryTime.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * The instant after which delivery day `date` is frozen and belongs to the
 * kitchen: `KITCHEN_LEAD_HOURS` before the plan's `deliveryTime`. Falls back to
 * noon IST when the delivery time is missing or unparseable.
 */
export function deliveryCutoffAt(date: string, deliveryTime?: string): Date {
  const slot = parseHhMm(deliveryTime);
  if (!slot) return istInstant(date, DELIVERY_CUTOFF_HOUR_IST, 0);
  const delivery = istInstant(date, slot.hour, slot.minute);
  return new Date(delivery.getTime() - KITCHEN_LEAD_HOURS * MS_PER_HOUR);
}

/** The last instant at which `date` may still be booked. */
export function bookingDeadlineAt(date: string, deliveryTime?: string): Date {
  return new Date(deliveryCutoffAt(date, deliveryTime).getTime() - MIN_LEAD_HOURS * MS_PER_HOUR);
}

/**
 * The kitchen cutoff as a human "9:00 AM" label, for surfacing the real
 * per-delivery freeze time in the UI. Uses the same missing/invalid fallback as
 * {@link deliveryCutoffAt} (noon).
 */
export function deliveryCutoffLabel(deliveryTime?: string): string {
  const slot = parseHhMm(deliveryTime);
  const totalMinutes = slot
    ? slot.hour * 60 + slot.minute - KITCHEN_LEAD_HOURS * 60
    : DELIVERY_CUTOFF_HOUR_IST * 60;
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** The instant the suggestion for `date` becomes visible: 20:00 IST on D-1. */
export function suggestionVisibleFrom(date: string): Date {
  return istInstant(addIstDays(date, -1), SUGGESTION_HOUR_IST, 0);
}

/**
 * Locked days reject schedule / reschedule / unschedule. Always derived, never
 * stored — a clock skew or a redeploy can't leave a stale lock flag in Mongo.
 */
export function isDateLocked(date: string, now: Date, deliveryTime?: string): boolean {
  return now.getTime() >= deliveryCutoffAt(date, deliveryTime).getTime();
}

export function isDateBookable(date: string, now: Date, deliveryTime?: string): boolean {
  return now.getTime() < bookingDeadlineAt(date, deliveryTime).getTime();
}

export function isSuggestionVisible(date: string, now: Date): boolean {
  return now.getTime() >= suggestionVisibleFrom(date).getTime();
}

export interface ScheduleWindow {
  /** First bookable IST date. */
  from: string;
  /** Last bookable IST date, inclusive. `to < from` means the window is closed. */
  to: string;
}

export function schedulableWindow(
  now: Date,
  expiresOn: string,
  deliveryTime?: string,
): ScheduleWindow {
  let from = istToday(now);
  // Walk forward off any already-locked day. Bounded so this runs at most a day
  // or two; the cap is a guard against a pathological config.
  for (let i = 0; i < 3 && !isDateBookable(from, now, deliveryTime); i++) {
    from = addIstDays(from, 1);
  }
  return { from, to: expiresOn };
}

export interface ScheduleDay {
  date: string;
  weekday: string;
  locked: boolean;
  suggestionVisible: boolean;
}

/**
 * The contiguous day cards the scheduler renders, oldest first. Starts at *today*
 * — not at the first bookable day — so a customer still sees today's card, greyed
 * and locked, rather than having it silently vanish at noon.
 */
export function schedulableDates(
  now: Date,
  expiresOn: string,
  deliveryTime?: string,
  maxDays: number = CREDIT_VALIDITY_DAYS,
): ScheduleDay[] {
  const start = istToday(now);
  if (!expiresOn || expiresOn < start) return [];

  const span = Math.min(istDaysBetween(start, expiresOn) + 1, maxDays);
  const out: ScheduleDay[] = [];
  for (let i = 0; i < span; i++) {
    const date = addIstDays(start, i);
    out.push({
      date,
      weekday: istWeekday(date),
      locked: isDateLocked(date, now, deliveryTime),
      suggestionVisible: isSuggestionVisible(date, now),
    });
  }
  return out;
}

/**
 * The earliest day the customer can still book that they haven't already used —
 * what the in-app "accept a suggestion" card targets.
 *
 * Deliberately NOT gated on `suggestionVisible`. That flag is the evening (D-1
 * 20:00 IST) reveal window for the Phase-2 WhatsApp nudge; the in-app card should
 * help fill any open day, so between noon and 8pm it must still suggest tomorrow.
 */
export function firstOpenDay(
  days: ScheduleDay[],
  takenDates: Iterable<string>,
): ScheduleDay | null {
  const taken = new Set(takenDates);
  return days.find((d) => !d.locked && !taken.has(d.date)) ?? null;
}

export type ScheduleRejection =
  | "plan-not-active"
  | "date-in-past"
  | "date-locked"
  | "date-after-expiry"
  | "date-taken"
  | "no-credit-available"
  | "item-not-allowed";

type PlanStatus = SubscriptionMealPlan["status"];

function checkTargetDate(
  now: Date,
  date: string,
  expiresOn: string,
  deliveryTime?: string,
): ScheduleRejection | null {
  if (date < istToday(now)) return "date-in-past";
  if (!isDateBookable(date, now, deliveryTime)) return "date-locked";
  if (date > expiresOn) return "date-after-expiry";
  return null;
}

/** Everything the schedule endpoint must check, minus the DB reads. */
export function validateSchedule(input: {
  now: Date;
  date: string;
  expiresOn: string;
  planStatus: PlanStatus;
  /** Dates held by this plan's other scheduled | delivered credits. */
  takenDates: string[];
  availableCredits: number;
  itemAllowed: boolean;
  /** Plan's "HH:mm" IST slot; drives the per-plan kitchen cutoff. */
  deliveryTime?: string;
}): ScheduleRejection | null {
  if (input.planStatus !== "active") return "plan-not-active";

  const dateProblem = checkTargetDate(
    input.now,
    input.date,
    input.expiresOn,
    input.deliveryTime,
  );
  if (dateProblem) return dateProblem;

  if (input.takenDates.includes(input.date)) return "date-taken";
  if (input.availableCredits <= 0) return "no-credit-available";
  if (!input.itemAllowed) return "item-not-allowed";
  return null;
}

/**
 * A reschedule is an unschedule of `fromDate` plus a schedule of `toDate`, so
 * BOTH must be unlocked. Moving a credit onto its own date is a legal item swap.
 */
export function validateReschedule(input: {
  now: Date;
  fromDate: string;
  toDate: string;
  expiresOn: string;
  planStatus: PlanStatus;
  takenDates: string[];
  itemAllowed: boolean;
  /** Plan's "HH:mm" IST slot; drives the per-plan kitchen cutoff. */
  deliveryTime?: string;
}): ScheduleRejection | null {
  if (input.planStatus !== "active") return "plan-not-active";
  if (isDateLocked(input.fromDate, input.now, input.deliveryTime)) return "date-locked";

  const dateProblem = checkTargetDate(
    input.now,
    input.toDate,
    input.expiresOn,
    input.deliveryTime,
  );
  if (dateProblem) return dateProblem;

  const taken = input.takenDates.filter((d) => d !== input.fromDate);
  if (taken.includes(input.toDate)) return "date-taken";
  if (!input.itemAllowed) return "item-not-allowed";
  return null;
}

export function validateUnschedule(input: {
  now: Date;
  date: string;
  planStatus: PlanStatus;
  /** Plan's "HH:mm" IST slot; drives the per-plan kitchen cutoff. */
  deliveryTime?: string;
}): ScheduleRejection | null {
  if (input.planStatus !== "active") return "plan-not-active";
  if (isDateLocked(input.date, input.now, input.deliveryTime)) return "date-locked";
  return null;
}

export interface CreditAccounting {
  total: number;
  available: number;
  scheduled: number;
  delivered: number;
  expired: number;
  cancelled: number;
  /** Whole IST days from today to expiresOn, clamped at 0. */
  daysLeft: number;
  /** Nothing left to spend and nothing pending delivery. */
  exhausted: boolean;
}

export function accountCredits(
  credits: SubscriptionCredit[],
  expiresOn: string,
  now: Date,
): CreditAccounting {
  const count = (s: SubscriptionCredit["status"]) =>
    credits.reduce((n, c) => n + (c.status === s ? 1 : 0), 0);

  const available = count("available");
  const scheduled = count("scheduled");

  return {
    total: credits.length,
    available,
    scheduled,
    delivered: count("delivered"),
    expired: count("expired"),
    cancelled: count("cancelled"),
    daysLeft: expiresOn ? Math.max(0, istDaysBetween(istToday(now), expiresOn)) : 0,
    exhausted: available + scheduled === 0,
  };
}

/**
 * Pure transform: `available` → `expired` once IST today has passed `expiresOn`
 * (which is inclusive). Returns null when nothing changed, so the caller can
 * skip the DB write.
 */
export function expireCredits(
  credits: SubscriptionCredit[],
  expiresOn: string,
  now: Date,
): SubscriptionCredit[] | null {
  if (!expiresOn) return null;
  if (istToday(now) <= expiresOn) return null;
  if (!credits.some((c) => c.status === "available")) return null;

  return credits.map((c) =>
    c.status === "available" ? { ...c, status: "expired" as const, expiredAt: now } : c,
  );
}

export interface SuggestionCandidate {
  id: string;
  name: string;
  isVeg: boolean;
  protein: number;
  kcal: number;
  image: string;
}

/** FNV-1a, 32-bit. Exported so the suggestion rotation is pinned by tests. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** How many recently-eaten items to steer away from. */
const AVOID_RECENT = 3;

/**
 * Deterministic, side-effect-free. The same (plan, date) always yields the same
 * item, so the Accept button doesn't shuffle under the user between polls.
 *
 * This NEVER books anything — rule: no meal is ever scheduled without a tap.
 */
export function suggestItemForDate<T extends SuggestionCandidate>(input: {
  date: string;
  /** Already narrowed by filterItemsForPlan(). */
  candidates: T[];
  /** This plan's scheduled + delivered credits, any order. */
  history: Array<{ date: string; productId: string }>;
  /** Stabilizes rotation across renders and requests. Pass the planId. */
  seed: string;
}): T | null {
  const { date, candidates, history, seed } = input;
  if (candidates.length === 0) return null;

  // Sort by id so the result never depends on Mongo's return order.
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set(sorted.map((c) => c.id));

  // Walk history newest-first, collecting distinct ids that are still on the menu.
  // Cap the exclusion at candidates.length - 1 so the pool can never empty.
  const limit = Math.min(AVOID_RECENT, sorted.length - 1);
  const recent = new Set<string>();
  for (const h of [...history].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (recent.size >= limit) break;
    if (ids.has(h.productId)) recent.add(h.productId);
  }

  const pool = sorted.filter((c) => !recent.has(c.id));
  const from = pool.length > 0 ? pool : sorted;
  return from[hash32(`${seed}|${date}`) % from.length];
}
