// Wastage — stock thrown away rather than sold, or spoiled before a recipe
// could use it.
//
// A wastage is the simplest kind of stock movement in the console: one item,
// one quantity, straight off the shelf. Unlike an audit (which replaces a
// figure) or an addition (which tops one up), nothing is being reconciled —
// so each wastage is its own record rather than a batched save, and the
// history is a flat list.
//
// Pure logic only, mirroring src/lib/stockAudits.ts: no Mongo, no Next. The
// IO half lives in src/app/api/inventory/wastages. See wastage.test.ts.

import { parseStockQty } from "./stockAdjustment";
import { costOf, roundQty, type AuditKind } from "./stockAudits";

/** Wastage is recorded against the same two collections the stock screens use. */
export type WastageKind = AuditKind;

export interface WastageEntry {
  _id: string;
  kind: WastageKind;
  /** The raw material's or production item's id. */
  refId: string;
  /** Snapshotted at record time, so history stays readable after a rename. */
  name: string;
  /** The item's consumption unit, snapshotted alongside the name. */
  unit: string;
  /** How much was wasted, in `unit`. Always more than 0. */
  qty: number;
  /**
   * What one consumption unit was worth AT RECORD TIME.
   *
   * Snapshotted rather than looked up on read: re-pricing last month's spoilage
   * at today's rate would quietly rewrite what it cost. null = the item had no
   * price or no unit conversion, so it could not be valued.
   */
  unitCost: number | null;
  /** qty × unitCost. null when the item could not be valued. */
  cost: number | null;
  /** null = nothing was on record; this item's stock was never counted. */
  previousStock: number | null;
  /** Where the quantity landed after the deduction. Never negative. */
  closingStock: number;
  /**
   * How much of `qty` the shelf could not cover. 0 when it was covered.
   * Stock floors at zero, so this is where an over-draw is recorded instead
   * of being lost.
   */
  shortfall: number;
  /** ISO instant. */
  recordedAt: string;
  /** The session role that recorded it; the console has no per-user identity. */
  recordedByRole: string;
}

/** What recording a wastage does to the quantity, and what it was worth. */
export interface WastageMovement {
  qty: number;
  closingStock: number;
  shortfall: number;
  unitCost: number | null;
  cost: number | null;
}

/**
 * Take a wasted quantity off what is on record.
 *
 * Same flooring rule as buildConsumptionLine: an item with no stock figure is
 * treated as empty, and throwing away more than the books hold means the item
 * was under-counted, not that the shelf now holds a negative quantity. The
 * uncovered part survives as `shortfall` so that fact is recorded.
 *
 * The cost values the FULL wasted quantity, not just the part the books could
 * cover — what went in the bin went in the bin, whatever the count said.
 */
export function buildWastage(input: {
  qty: number;
  previousStock: number | null;
  /** Price of one consumption unit now; omitted when the item has none. */
  unitCost?: number | null;
}): WastageMovement {
  const qty = roundQty(input.qty);
  const available = input.previousStock ?? 0;
  const unitCost = input.unitCost || null;
  return {
    qty,
    closingStock: roundQty(Math.max(0, available - qty)),
    shortfall: roundQty(Math.max(0, qty - available)),
    unitCost,
    cost: costOf(qty, unitCost),
  };
}

/**
 * Validate a wasted quantity coming off the wire.
 *
 * Stricter than parseStockQty by exactly one rule: zero is a valid stock level
 * but not a valid wastage — it would record that nothing was thrown away.
 */
export function parseWastageQty(input: unknown): {
  value?: number;
  error?: string;
} {
  const { value, error } = parseStockQty(input);
  if (error || value === undefined) {
    return { error: error ?? "Quantity is required" };
  }
  if (value === 0) return { error: "Quantity must be more than 0" };
  return { value };
}
