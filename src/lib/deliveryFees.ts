/**
 * Small-order delivery fees, per location.
 *
 * A rule is a threshold and a fee: an order whose ITEM SUBTOTAL falls below the
 * threshold pays the fee, and one at or above it delivers free. The subtotal is
 * taken BEFORE any discount, so a coupon or the first-order discount can never
 * push a customer back under the threshold and cost them free delivery.
 *
 * Rules live in the shared `settings` collection under `key: "delivery-fees"`,
 * mirroring society-discounts and streak-ladders. A location without its own
 * rule uses the editable default. This is the ONLY source of a delivery fee —
 * it replaced the hardcoded per-society `deliveryCharge`.
 *
 * Pure and client-safe (no DB): the cart previews exactly what the order route
 * later recomputes and charges.
 */

import { SOCIETIES } from "./societies";

/** `settings` document key. */
export const DELIVERY_FEES_KEY = "delivery-fees";

/** Spend at or above this and delivery is free, unless a location overrides it. */
export const DEFAULT_THRESHOLD = 250;

/** No fee until an admin sets one, so nothing starts charging on deploy. */
export const DEFAULT_FEE = 0;

export const MAX_THRESHOLD = 100_000;
export const MAX_FEE = 10_000;

export interface DeliveryFeeRule {
  /** Item subtotal (pre-discount) at or above which delivery is free. */
  threshold: number;
  /** Fee charged when the subtotal is below the threshold. */
  fee: number;
}

export interface DeliveryFeeConfig {
  default: DeliveryFeeRule;
  /** Location id → its own rule. Absent means it uses the default. */
  byLocation: Record<string, DeliveryFeeRule>;
}

export const DEFAULT_RULE: DeliveryFeeRule = {
  threshold: DEFAULT_THRESHOLD,
  fee: DEFAULT_FEE,
};

const SOCIETY_IDS = new Set<string>(SOCIETIES.map((s) => s.id));

/** Whole non-negative integer within `max`, or null if the input is unusable. */
function toAmount(raw: unknown, max: number): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(max, value);
}

/** Coerce arbitrary input into a rule, or null when either half is unusable. */
export function sanitizeRule(input: unknown): DeliveryFeeRule | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { threshold?: unknown; fee?: unknown };
  const threshold = toAmount(raw.threshold, MAX_THRESHOLD);
  const fee = toAmount(raw.fee, MAX_FEE);
  if (threshold === null || fee === null) return null;
  return { threshold, fee };
}

/** Coerce the whole stored document. Unknown location ids are dropped. */
export function sanitizeDeliveryFeeConfig(input: unknown): DeliveryFeeConfig {
  const raw = (input ?? {}) as { default?: unknown; byLocation?: unknown };
  const byLocation: Record<string, DeliveryFeeRule> = {};
  if (raw.byLocation && typeof raw.byLocation === "object") {
    for (const [id, value] of Object.entries(
      raw.byLocation as Record<string, unknown>,
    )) {
      if (!SOCIETY_IDS.has(id)) continue;
      const rule = sanitizeRule(value);
      if (rule) byLocation[id] = rule;
    }
  }
  return { default: sanitizeRule(raw.default) ?? DEFAULT_RULE, byLocation };
}

/** The rule in force for a location: its own if set, otherwise the default. */
export function ruleFor(
  config: DeliveryFeeConfig | null | undefined,
  societyId: string | null | undefined,
): DeliveryFeeRule {
  const own = societyId ? config?.byLocation?.[societyId] : undefined;
  return own ?? config?.default ?? DEFAULT_RULE;
}

/**
 * The delivery fee for an item subtotal under a rule. Zero when the rule has no
 * fee configured, or when the subtotal has reached the threshold — so a
 * threshold of 0 means delivery is always free.
 */
export function computeDeliveryFee(
  subtotal: number,
  rule: DeliveryFeeRule,
): number {
  if (!(rule.fee > 0)) return 0;
  if (subtotal >= rule.threshold) return 0;
  return rule.fee;
}

/**
 * How much more the customer must add to reach free delivery, or 0 when they
 * already have it. Drives the "add ₹X more" nudge in the cart.
 */
export function amountToFreeDelivery(
  subtotal: number,
  rule: DeliveryFeeRule,
): number {
  if (computeDeliveryFee(subtotal, rule) === 0) return 0;
  return Math.max(0, Math.ceil(rule.threshold - subtotal));
}
