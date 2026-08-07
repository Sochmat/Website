/**
 * Per-location kill switches for ordering and delivery.
 *
 * These layer on top of the global store/delivery flags — they can only ever
 * CLOSE a location, never force one open. So a global shutdown (the manual
 * Store OFF button, or the weekly schedule) still closes everywhere, and a
 * location left switched on cannot silently undo it. Concretely:
 *
 *     store open at L    = global effective open  AND  storeOn(L)
 *     delivery on at L   = global delivery on     AND  deliveryOn(L)
 *
 * Values live in the shared `settings` collection under
 * `key: "location-availability"`, mirroring society-discounts and
 * delivery-fees.
 *
 * A location with no entry is ON. Absence must mean available, or adding a new
 * society to SOCIETIES would silently launch it closed — and worse, a settings
 * document that failed to load would shutter every location at once.
 *
 * Pure and client-safe (no DB) so the storefront can grey out a location using
 * exactly the rule the order route later enforces.
 */

import { SOCIETIES } from "./societies";

/** `settings` document key. */
export const LOCATION_AVAILABILITY_KEY = "location-availability";

/** Location id → whether that switch is on. A missing id means on. */
export type AvailabilityMap = Record<string, boolean>;

export interface LocationAvailability {
  /** Per-location ordering switch. */
  store: AvailabilityMap;
  /** Per-location delivery switch. */
  delivery: AvailabilityMap;
}

export const ALL_AVAILABLE: LocationAvailability = { store: {}, delivery: {} };

const SOCIETY_IDS = new Set<string>(SOCIETIES.map((s) => s.id));

/**
 * Coerce one half of the document into a clean map. Unknown location ids and
 * non-boolean values are dropped rather than coerced: a stray `"false"` string
 * turning into `true` would reopen a location an admin had closed.
 *
 * Only `false` is stored. `true` is the default, so persisting it would just be
 * a second way to spell the same state.
 */
function sanitizeMap(input: unknown): AvailabilityMap {
  const out: AvailabilityMap = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SOCIETY_IDS.has(id)) continue;
    if (value === false) out[id] = false;
  }
  return out;
}

/** Coerce the whole stored document. */
export function sanitizeLocationAvailability(
  input: unknown,
): LocationAvailability {
  const raw = (input ?? {}) as { store?: unknown; delivery?: unknown };
  return {
    store: sanitizeMap(raw.store),
    delivery: sanitizeMap(raw.delivery),
  };
}

/** Is ordering switched on at this location? Unknown/missing → yes. */
export function isStoreOnAt(
  config: LocationAvailability | null | undefined,
  societyId: string | null | undefined,
): boolean {
  if (!config || !societyId) return true;
  return config.store?.[societyId] !== false;
}

/** Is delivery switched on at this location? Unknown/missing → yes. */
export function isDeliveryOnAt(
  config: LocationAvailability | null | undefined,
  societyId: string | null | undefined,
): boolean {
  if (!config || !societyId) return true;
  return config.delivery?.[societyId] !== false;
}
