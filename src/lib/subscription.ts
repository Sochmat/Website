import type { MenuItem } from "./types";

export const GST_RATE = 0.05;
export const SUBSCRIPTION_HOST_PREFIX = "subscription.";

/** Fields the builder/API need from a menu item to price a plan day. */
export interface PlanItem {
  name: string;
  protein: number;
  kcal: number;
  subscriptionPrice: number;
  isAvailableForSubscription?: boolean;
}

export interface PlanDayInput {
  date: string; // yyyy-mm-dd
  weekday: string;
  productId: string;
}

export interface PlanDayComputed extends PlanDayInput {
  itemName: string;
  subscriptionPrice: number;
  protein: number;
  kcal: number;
}

export interface PlanTotals {
  days: PlanDayComputed[];
  totalProtein: number;
  totalKcal: number;
  itemCount: number;
  subtotal: number;
  tax: number;
  totalAmount: number;
}

/** True when the request host is the subscription subdomain (port/case-insensitive). */
export function isSubscriptionHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.toLowerCase().split(":")[0].startsWith(SUBSCRIPTION_HOST_PREFIX);
}

/** An item is offered in the builder only when the flag is on AND it has a price. */
export function isEligible(item: {
  isAvailableForSubscription?: boolean;
  subscriptionPrice?: number;
}): boolean {
  return item.isAvailableForSubscription === true && (item.subscriptionPrice ?? 0) > 0;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** 7 consecutive days from `startDate` (yyyy-mm-dd), computed in UTC to avoid TZ drift. */
export function buildWeekDates(startDate: string): { date: string; weekday: string }[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const out: { date: string; weekday: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push({ date: dt.toISOString().slice(0, 10), weekday: WEEKDAYS[dt.getUTCDay()] });
  }
  return out;
}

/**
 * Recompute a plan's money/nutrition from authoritative item data.
 * Throws if any day references an item that is missing or ineligible.
 */
export function computePlanTotals(
  days: PlanDayInput[],
  itemsById: Map<string, PlanItem>,
): PlanTotals {
  const computed: PlanDayComputed[] = days.map((day) => {
    const item = itemsById.get(day.productId);
    if (!item || !isEligible(item)) {
      throw new Error(`Item ${day.productId} is not available for subscription`);
    }
    return {
      date: day.date,
      weekday: day.weekday,
      productId: day.productId,
      itemName: item.name,
      subscriptionPrice: item.subscriptionPrice,
      protein: item.protein,
      kcal: item.kcal,
    };
  });

  const subtotal = computed.reduce((s, d) => s + d.subscriptionPrice, 0);
  const totalProtein = computed.reduce((s, d) => s + d.protein, 0);
  const totalKcal = computed.reduce((s, d) => s + d.kcal, 0);
  const tax = Math.round(subtotal * GST_RATE);

  return {
    days: computed,
    totalProtein,
    totalKcal,
    itemCount: computed.length,
    subtotal,
    tax,
    totalAmount: subtotal + tax,
  };
}

export function generatePlanNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUBP-${t}-${r}`;
}

/** Narrowing helper: map a MenuItem-shaped doc to a PlanItem. */
export function toPlanItem(item: Pick<MenuItem, "name" | "protein" | "kcal"> & {
  subscriptionPrice?: number;
  isAvailableForSubscription?: boolean;
}): PlanItem {
  return {
    name: item.name,
    protein: item.protein ?? 0,
    kcal: item.kcal ?? 0,
    subscriptionPrice: item.subscriptionPrice ?? 0,
    isAvailableForSubscription: item.isAvailableForSubscription ?? false,
  };
}
