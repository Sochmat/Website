/**
 * Per-society delivery slot logic.
 *
 * A society with an empty `slots` array has no time restriction — delivery is
 * available whenever the store is open. A society with slots only offers
 * delivery while a slot's order cutoff is still ahead; the "active" slot is the
 * earliest one whose cutoff has not yet passed (auto-assigned next window).
 *
 * Like `ist.ts`, nothing here reads the clock — callers inject `now`, keeping
 * every function pure and unit-testable.
 */

import type { DeliverySlot, Society } from "./societies";
import { istMinutesOfDay, parseHHMM, formatMinutesLabel } from "./ist";

/**
 * The slot a delivery order placed at `now` would be assigned to: the earliest
 * slot whose `orderBefore` cutoff is still strictly in the future. Returns
 * `null` when the society has no slots, or when every cutoff has passed.
 */
export function activeSlot(society: Society, now: Date): DeliverySlot | null {
  if (society.slots.length === 0) return null;
  const nowMin = istMinutesOfDay(now);
  for (const slot of society.slots) {
    const cutoff = parseHHMM(slot.orderBefore);
    if (cutoff !== null && nowMin < cutoff) return slot;
  }
  return null;
}

/**
 * Whether delivery is available for this society right now. Societies without
 * slots are always open (subject to the global store toggle handled elsewhere);
 * societies with slots are open only while a slot cutoff is still ahead.
 */
export function isDeliveryOpenNow(society: Society, now: Date): boolean {
  if (society.slots.length === 0) return true;
  return activeSlot(society, now) !== null;
}

/** A human window label, e.g. "Order before 12:30 PM · get by 1:00 PM". */
export function formatSlot(slot: DeliverySlot): string {
  const before = parseHHMM(slot.orderBefore);
  const till = parseHHMM(slot.getTill);
  const beforeLabel = before === null ? slot.orderBefore : formatMinutesLabel(before);
  const tillLabel = till === null ? slot.getTill : formatMinutesLabel(till);
  return `Order before ${beforeLabel} · get by ${tillLabel}`;
}

/** The stored window string for an order, e.g. "12:30–13:00". */
export function slotWindowLabel(slot: DeliverySlot): string {
  return `${slot.orderBefore}–${slot.getTill}`;
}
