/**
 * Per-society flat discount percentages.
 *
 * Admins set a whole-number percentage (0–100) per society; it is applied to
 * the item subtotal (before GST) on every order to that society, stacking with
 * any coupon. Values live in the shared `settings` collection under
 * `key: "society-discounts"`, mirroring the store-hours/delivery settings.
 */

import { SOCIETIES } from "./societies";

/** `settings` document key. */
export const SOCIETY_DISCOUNTS_KEY = "society-discounts";

/** Map of society id → discount percentage (0–100). */
export type SocietyDiscountMap = Record<string, number>;

const KNOWN_IDS = new Set(SOCIETIES.map((s) => s.id));

/**
 * Coerce arbitrary input into a clean map: only known society ids, each an
 * integer percentage clamped to 0–100. Anything else is dropped.
 */
export function sanitizeDiscountMap(input: unknown): SocietyDiscountMap {
  const out: SocietyDiscountMap = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KNOWN_IDS.has(id)) continue;
    const pct = Math.round(Number(raw));
    if (!Number.isFinite(pct) || pct <= 0) continue;
    out[id] = Math.min(100, pct);
  }
  return out;
}

/** The discount percentage for a society id (0 when none or unknown). */
export function discountPercentFor(
  map: SocietyDiscountMap | null | undefined,
  societyId: string | null | undefined,
): number {
  if (!map || !societyId) return 0;
  const pct = map[societyId];
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
}

/** The rupee discount for a subtotal at a given percentage (rounded). */
export function computeSocietyDiscount(subtotal: number, percent: number): number {
  if (!(percent > 0) || !(subtotal > 0)) return 0;
  return Math.round((subtotal * percent) / 100);
}
