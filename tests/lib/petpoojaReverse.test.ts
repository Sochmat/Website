import { describe, it, expect } from "vitest";
import { buildConsumptionLine } from "@/lib/stockAudits";

/**
 * The reversal contract, tested against buildConsumptionLine — the same
 * function the deduction uses to produce the lines a reversal later reads.
 *
 * The rule under test: a reversal restores the FULL consumedQty, never
 * `consumedQty - shortfall`. `shortfall` reports how much of a draw-down the
 * shelf could not cover, but drawDownStock $incs by the whole consumedQty and
 * lets currentStock go negative, so anything less strands the difference.
 */

/** What restoreDrawnDownStock adds back for a line. */
const restored = (line: { consumedQty?: number | null }) =>
  Number(line.consumedQty);

describe("reversal amount", () => {
  it("restores the full quantity when the shelf covered it", () => {
    const line = buildConsumptionLine({
      id: "a".repeat(24),
      name: "Paneer",
      unit: "g",
      previousStock: 1000,
      consumedQty: 250,
    });
    expect(line.shortfall).toBe(0);
    expect(line.closingStock).toBe(750);
    // Restoring returns the shelf to where it started.
    expect(line.closingStock + restored(line)).toBe(1000);
  });

  it("restores the full quantity even when the line went short", () => {
    const line = buildConsumptionLine({
      id: "b".repeat(24),
      name: "Cream",
      unit: "g",
      previousStock: 100,
      consumedQty: 250,
    });
    // 150 of the draw-down was not covered...
    expect(line.shortfall).toBe(150);
    // ...but the deduction still spent all 250, leaving the shelf at -150.
    expect(line.closingStock).toBe(-150);
    // So the reversal must add all 250 back, not 100.
    expect(line.closingStock + restored(line)).toBe(100);
    expect(restored(line) - Number(line.shortfall)).not.toBe(restored(line));
  });

  it("restores the full quantity for an item that was never counted", () => {
    const line = buildConsumptionLine({
      id: "c".repeat(24),
      name: "Untracked",
      unit: "g",
      previousStock: null,
      consumedQty: 40,
    });
    expect(line.shortfall).toBe(40);
    expect(line.closingStock).toBe(-40);
    // Back to zero — where an uncounted item effectively started.
    expect(line.closingStock + restored(line)).toBe(0);
  });

  it("restores the full quantity when stock was already in the red", () => {
    const line = buildConsumptionLine({
      id: "d".repeat(24),
      name: "Already owed",
      unit: "g",
      previousStock: -20,
      consumedQty: 50,
    });
    // The pre-existing debt is not blamed on this draw-down...
    expect(line.shortfall).toBe(50);
    expect(line.closingStock).toBe(-70);
    // ...and reversing returns it exactly to that pre-existing debt.
    expect(line.closingStock + restored(line)).toBe(-20);
  });

  it("round-trips a whole entry's lines back to their opening figures", () => {
    const opening = [1000, 100, 0, -20];
    const lines = opening.map((previousStock, i) =>
      buildConsumptionLine({
        id: String(i).repeat(24).slice(0, 24),
        name: `Item ${i}`,
        unit: "g",
        previousStock,
        consumedQty: 60,
      }),
    );
    const reversed = lines.map((l) => l.closingStock + restored(l));
    expect(reversed).toEqual(opening);
  });
});
