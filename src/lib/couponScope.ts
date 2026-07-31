/**
 * Location scope for coupons.
 *
 * A coupon carries `societyIds` — the locations it runs at. An empty (or
 * missing) list means every location, which is what every pre-existing coupon
 * has, so the field is backwards-compatible.
 *
 * Pure helpers only, shared by the admin form, the coupon-validation route and
 * the order route so all three agree on where a code is honoured.
 */

import { SOCIETIES, getSocietyById } from "./societies";

const KNOWN_IDS = new Set(SOCIETIES.map((s) => s.id));

/**
 * Coerce admin input into a clean scope for storage: known society ids only,
 * de-duplicated and in SOCIETIES order. Selecting every location is stored as
 * [] ("all locations") so a coupon keeps working when a new society is added.
 */
export function sanitizeCouponSocietyIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set<string>();
  for (const raw of input) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (KNOWN_IDS.has(id)) picked.add(id);
  }
  if (picked.size === 0 || picked.size === SOCIETIES.length) return [];
  return SOCIETIES.filter((s) => picked.has(s.id)).map((s) => s.id);
}

/** The stored scope as a list of ids, without dropping now-unknown societies. */
function storedScope(societyIds: unknown): string[] {
  if (!Array.isArray(societyIds)) return [];
  return societyIds
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Whether a coupon is honoured at a society. An unscoped coupon runs
 * everywhere; a scoped one runs only at its listed societies — ids no longer in
 * SOCIETIES simply never match, so a removed location fails closed.
 */
export function couponAppliesToSociety(
  societyIds: unknown,
  societyId: string | null | undefined,
): boolean {
  const scope = storedScope(societyIds);
  if (scope.length === 0) return true;
  return !!societyId && scope.includes(societyId);
}

/** Human-readable scope for the admin list, e.g. "Zomato office". */
export function describeCouponScope(societyIds: unknown): string {
  const scope = storedScope(societyIds);
  if (scope.length === 0) return "All locations";
  return scope
    .map((id) => (KNOWN_IDS.has(id) ? getSocietyById(id).name : id))
    .join(", ");
}
