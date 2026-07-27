// The audit trail behind the inventory Audit and Add Stock screens: one record
// per save, and the variance maths that both the API and the history drawer
// report.
//
// Raw materials and production items are counted and saved separately, so a
// record always belongs to exactly one kind — there is no mixed-kind save.
//
// Pure logic — see stockAudits.test.ts.

import { roundCurrency } from "./productionItems";

export type AuditKind = "raw" | "production";

/**
 * What the save did to the quantity.
 *
 * "audit"    — a stock-take: the counted closing figure REPLACES what was on
 *              record, and the gap between the two is the finding.
 * "addition" — new stock received: the entered quantity is ADDED to what was
 *              on record.
 *
 * Both land in the same collection because they are the same shape of event —
 * a quantity moving from one value to another, with a reason — and the history
 * for each screen is simply this field plus the kind.
 */
export type AuditType = "audit" | "addition";

export interface AuditLine {
  id: string;
  /** Snapshotted at save time, so history stays readable after a rename. */
  name: string;
  unit: string;
  /** null = nothing was on record yet; this row was a first count. */
  previousStock: number | null;
  /** Where the quantity ended up: the counted figure, or previous + added. */
  closingStock: number;
  /** null when there was no previous quantity to measure against. */
  diff: number | null;
  /** null when previous was absent or zero — no base to divide by. */
  pctDiff: number | null;
  /** Additions only: what was added on top of previousStock. */
  addedQty?: number | null;
  /** Consumption lines only: what the recipes called for. */
  consumedQty?: number | null;
  /**
   * Consumption lines only: how much of consumedQty could not be taken because
   * the stock was not there. 0 when it was covered. Stock never goes negative,
   * so this is where an over-draw is recorded instead of being lost.
   */
  shortfall?: number | null;
  /**
   * What one consumption unit was worth AT SAVE TIME.
   *
   * Snapshotted rather than looked up on read: re-pricing an old stock-take at
   * today's rate would quietly rewrite what it found. null = the item had no
   * price or no unit conversion, so it could not be valued.
   */
  unitCost?: number | null;
  /**
   * What this line's movement was worth: the variance for a stock-take, the
   * quantity received for an addition. null when there is nothing to value.
   */
  changeCost?: number | null;
}

/** A save, without its lines — what the history list needs. */
export interface AuditSummary {
  _id: string;
  kind: AuditKind;
  type: AuditType;
  /** ISO instant. */
  savedAt: string;
  /** The session role that saved it; the console has no per-user identity. */
  savedByRole: string;
  rowCount: number;
  increases: number;
  decreases: number;
  unchanged: number;
  /** Rows that had no quantity on record before this save. */
  firstCounts: number;
  /**
   * What the save was worth in total, signed: negative when a stock-take found
   * less than the books said. null = not one row could be valued.
   */
  netCost: number | null;
  /** Rows with no cost figure — unpriced, or nothing to compare against. */
  unvaluedRows: number;
  /** Raw materials drawn down by this save. 0 unless it produced something. */
  consumedRows: number;
}

export interface AuditEntry extends AuditSummary {
  lines: AuditLine[];
  /**
   * Raw material spent by this save, for production-item additions: adding
   * stock the kitchen made also consumes what it was made from.
   */
  consumedLines?: AuditLine[];
}

/** Kill float noise (0.30000000000000004) and any negative zero. */
export function roundQty(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/**
 * A counted quantity measured against what was on record.
 *
 * A first count is not a discrepancy: with nothing to compare against, both
 * the quantity and the percentage are null rather than a misleading zero.
 */
export function auditVariance(
  previousStock: number | null,
  closingStock: number,
): { diff: number | null; pctDiff: number | null } {
  if (previousStock === null) return { diff: null, pctDiff: null };
  const diff = roundQty(closingStock - previousStock);
  return {
    diff,
    pctDiff: previousStock === 0 ? null : roundQty((diff / previousStock) * 100),
  };
}

/**
 * Value a movement at the rate captured with it.
 *
 * A missing or zero unit cost means "cannot be valued", not "free" — the
 * result is null so the screen can say so rather than print ₹0.00.
 */
export function costOf(
  qty: number | null,
  unitCost: number | null | undefined,
): number | null {
  if (qty === null || !unitCost) return null;
  return roundCurrency(qty * unitCost);
}

/** Build a line from a stored quantity and the counted one. */
export function buildAuditLine(input: {
  id: string;
  name: string;
  unit: string;
  previousStock: number | null;
  closingStock: number;
  /** Price of one consumption unit now; omitted when the item has none. */
  unitCost?: number | null;
}): AuditLine {
  const { diff, pctDiff } = auditVariance(
    input.previousStock,
    input.closingStock,
  );
  const unitCost = input.unitCost || null;
  return {
    ...input,
    diff,
    pctDiff,
    unitCost,
    // A stock-take's worth is its variance — what went missing or turned up.
    changeCost: costOf(diff, unitCost),
  };
}

/**
 * Build a line for stock received.
 *
 * The addition is applied to whatever was on record, treating "never counted"
 * as zero — receiving 5 of something untracked leaves you with 5. The line
 * still records previousStock as null, so history can tell "0 on hand" apart
 * from "nobody had counted it yet".
 */
export function buildAdditionLine(input: {
  id: string;
  name: string;
  unit: string;
  previousStock: number | null;
  addedQty: number;
  /** Price of one consumption unit now; omitted when the item has none. */
  unitCost?: number | null;
}): AuditLine {
  const addedQty = roundQty(input.addedQty);
  const closingStock = roundQty((input.previousStock ?? 0) + addedQty);
  const { diff, pctDiff } = auditVariance(input.previousStock, closingStock);
  const unitCost = input.unitCost || null;
  return {
    id: input.id,
    name: input.name,
    unit: input.unit,
    previousStock: input.previousStock,
    closingStock,
    diff,
    pctDiff,
    addedQty,
    unitCost,
    // A delivery's worth is what came in — priced even for a first count,
    // where there is no variance to speak of but stock still arrived.
    changeCost: costOf(addedQty, unitCost),
  };
}

/**
 * Build a line for raw material drawn down by producing something.
 *
 * The mirror of buildAdditionLine: adding production stock spends the recipe's
 * ingredients. Stock is floored at zero — a draw-down bigger than what is on
 * record means the raw material was under-counted, not that the kitchen now
 * holds a negative quantity — and the uncovered part is kept as `shortfall` so
 * that fact is recorded rather than silently swallowed.
 */
export function buildConsumptionLine(input: {
  id: string;
  name: string;
  unit: string;
  previousStock: number | null;
  consumedQty: number;
  /** Price of one consumption unit now; omitted when the item has none. */
  unitCost?: number | null;
}): AuditLine {
  const consumedQty = roundQty(input.consumedQty);
  // An untracked raw material is treated as empty: there is no quantity to
  // spend, so the whole draw-down is a shortfall.
  const available = input.previousStock ?? 0;
  const closingStock = roundQty(Math.max(0, available - consumedQty));
  const shortfall = roundQty(Math.max(0, consumedQty - available));
  const { diff, pctDiff } = auditVariance(input.previousStock, closingStock);
  const unitCost = input.unitCost || null;
  return {
    id: input.id,
    name: input.name,
    unit: input.unit,
    previousStock: input.previousStock,
    closingStock,
    diff,
    pctDiff,
    consumedQty,
    shortfall,
    unitCost,
    // diff is exactly what left the shelf (the shortfall never did), so this
    // values what was actually taken, not what the recipe asked for.
    changeCost: costOf(diff, unitCost),
  };
}

/** Headline figures for a save, so the history list reads without its lines. */
export function summarizeAuditLines(
  lines: AuditLine[],
): Pick<
  AuditSummary,
  | "rowCount"
  | "increases"
  | "decreases"
  | "unchanged"
  | "firstCounts"
  | "netCost"
  | "unvaluedRows"
> {
  const valued = lines.filter((l) => typeof l.changeCost === "number");
  return {
    rowCount: lines.length,
    increases: lines.filter((l) => (l.diff ?? 0) > 0).length,
    decreases: lines.filter((l) => (l.diff ?? 0) < 0).length,
    unchanged: lines.filter((l) => l.diff === 0).length,
    firstCounts: lines.filter((l) => l.previousStock === null).length,
    // null, not 0: "nothing here could be priced" is a different statement
    // from "this save came to nothing".
    netCost: valued.length
      ? roundCurrency(valued.reduce((sum, l) => sum + (l.changeCost as number), 0))
      : null,
    unvaluedRows: lines.length - valued.length,
  };
}
