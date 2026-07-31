import { describe, expect, it } from "vitest";
import {
  auditVariance,
  buildAdditionLine,
  buildAuditLine,
  buildConsumptionLine,
  costOf,
  roundQty,
  summarizeAuditLines,
  type AuditLine,
} from "@/lib/stockAudits";

describe("roundQty", () => {
  it("trims float noise", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });

  it("never returns a negative zero", () => {
    expect(Object.is(roundQty(-0), 0)).toBe(true);
    expect(Object.is(roundQty(0 - 0.0001), 0)).toBe(true);
  });
});

describe("auditVariance", () => {
  it("reports a surplus in qty and percent", () => {
    expect(auditVariance(100, 110)).toEqual({ diff: 10, pctDiff: 10 });
  });

  it("reports a shortfall as negative", () => {
    expect(auditVariance(80, 60)).toEqual({ diff: -20, pctDiff: -25 });
  });

  it("reports no variance when the count matches", () => {
    expect(auditVariance(12.5, 12.5)).toEqual({ diff: 0, pctDiff: 0 });
  });

  it("has no percentage to give when the record was zero", () => {
    expect(auditVariance(0, 5)).toEqual({ diff: 5, pctDiff: null });
  });

  it("treats a first count as no discrepancy at all", () => {
    expect(auditVariance(null, 5)).toEqual({ diff: null, pctDiff: null });
  });

  it("keeps fractional variances readable", () => {
    expect(auditVariance(0.3, 0.1 + 0.1)).toEqual({
      diff: -0.1,
      pctDiff: -33.333,
    });
  });
});

describe("costOf", () => {
  it("prices a quantity at the given rate", () => {
    expect(costOf(2, 12.5)).toBe(25);
  });

  it("rounds to paise", () => {
    expect(costOf(3, 0.335)).toBe(1.01);
  });

  it("cannot value an absent quantity or an unpriced item", () => {
    expect(costOf(null, 12)).toBeNull();
    expect(costOf(2, null)).toBeNull();
    expect(costOf(2, undefined)).toBeNull();
    // Zero is "no price on record", not "free".
    expect(costOf(2, 0)).toBeNull();
  });
});

describe("buildAuditLine", () => {
  it("carries the snapshot through and fills in the variance", () => {
    expect(
      buildAuditLine({
        id: "a1",
        name: "Toor Dal",
        unit: "kg",
        previousStock: 20,
        closingStock: 18,
        unitCost: 90,
      }),
    ).toEqual({
      id: "a1",
      name: "Toor Dal",
      unit: "kg",
      previousStock: 20,
      closingStock: 18,
      diff: -2,
      pctDiff: -10,
      unitCost: 90,
      // The shortfall is worth ₹180, and reads as a loss.
      changeCost: -180,
    });
  });

  it("leaves the cost open when the item has no price", () => {
    const line = buildAuditLine({
      id: "a1",
      name: "Toor Dal",
      unit: "kg",
      previousStock: 20,
      closingStock: 18,
    });
    expect(line.unitCost).toBeNull();
    expect(line.changeCost).toBeNull();
  });

  it("has nothing to value on a first count", () => {
    const line = buildAuditLine({
      id: "a1",
      name: "Toor Dal",
      unit: "kg",
      previousStock: null,
      closingStock: 18,
      unitCost: 90,
    });
    expect(line.unitCost).toBe(90);
    expect(line.changeCost).toBeNull();
  });
});

describe("buildAdditionLine", () => {
  const received = (previousStock: number | null, addedQty: number) =>
    buildAdditionLine({
      id: "a1",
      name: "Toor Dal",
      unit: "kg",
      previousStock,
      addedQty,
    });

  it("adds to what was on record", () => {
    expect(received(20, 5)).toMatchObject({
      previousStock: 20,
      addedQty: 5,
      closingStock: 25,
      diff: 5,
      pctDiff: 25,
    });
  });

  it("treats an untracked item as starting from zero", () => {
    expect(received(null, 5)).toMatchObject({
      previousStock: null,
      addedQty: 5,
      closingStock: 5,
      // Nothing to measure against, so no variance — but the addition stands.
      diff: null,
      pctDiff: null,
    });
  });

  it("has no percentage to give when the record was zero", () => {
    expect(received(0, 3)).toMatchObject({
      closingStock: 3,
      diff: 3,
      pctDiff: null,
    });
  });

  it("keeps fractional additions clean", () => {
    expect(received(0.1, 0.2)).toMatchObject({ closingStock: 0.3, diff: 0.2 });
  });

  it("values what arrived, even with nothing to compare against", () => {
    const line = buildAdditionLine({
      id: "a1",
      name: "Toor Dal",
      unit: "kg",
      previousStock: null,
      addedQty: 4,
      unitCost: 90,
    });
    // No variance to report, but ₹360 of stock still came in.
    expect(line.diff).toBeNull();
    expect(line.changeCost).toBe(360);
  });
});

describe("buildConsumptionLine", () => {
  const spend = (
    previousStock: number | null,
    consumedQty: number,
    unitCost?: number,
  ) =>
    buildConsumptionLine({
      id: "b",
      name: "Toor Dal",
      unit: "gm",
      previousStock,
      consumedQty,
      unitCost,
    });

  it("takes the recipe's share off what is on record", () => {
    expect(spend(500, 50, 0.12)).toMatchObject({
      previousStock: 500,
      consumedQty: 50,
      closingStock: 450,
      shortfall: 0,
      diff: -50,
      changeCost: -6,
    });
  });

  it("goes negative rather than stopping at zero, and says by how much", () => {
    // The food went out of the door; the books said there were only 30.
    expect(spend(30, 50)).toMatchObject({
      closingStock: -20,
      consumedQty: 50,
      shortfall: 20,
      diff: -50,
    });
  });

  it("goes negative from an exactly-empty shelf", () => {
    expect(spend(0, 50)).toMatchObject({
      previousStock: 0,
      closingStock: -50,
      shortfall: 50,
      diff: -50,
    });
  });

  it("goes further negative when already in the red", () => {
    expect(spend(-20, 50)).toMatchObject({
      closingStock: -70,
      shortfall: 50,
      diff: -50,
    });
  });

  it("treats an untracked material as empty and records the debt", () => {
    expect(spend(null, 50)).toMatchObject({
      previousStock: null,
      closingStock: -50,
      shortfall: 50,
      diff: null,
    });
  });

  it("values everything that left, including the uncovered part", () => {
    // All 50 went into the dish at ₹2 each, whatever the books said.
    expect(spend(30, 50, 2).changeCost).toBe(-100);
  });

  it("keeps fractional draw-downs clean", () => {
    expect(spend(0.3, 0.1).closingStock).toBe(0.2);
  });
});

describe("summarizeAuditLines", () => {
  const line = (
    previousStock: number | null,
    closingStock: number,
    unitCost?: number,
  ): AuditLine =>
    buildAuditLine({
      id: "x",
      name: "x",
      unit: "kg",
      previousStock,
      closingStock,
      unitCost,
    });

  it("counts each outcome once", () => {
    const summary = summarizeAuditLines([
      line(10, 12), // up
      line(10, 8), // down
      line(10, 10), // unchanged
      line(null, 4), // first count
    ]);
    expect(summary).toMatchObject({
      rowCount: 4,
      increases: 1,
      decreases: 1,
      unchanged: 1,
      firstCounts: 1,
    });
  });

  it("does not count a first count as unchanged", () => {
    const summary = summarizeAuditLines([line(null, 0)]);
    expect(summary.unchanged).toBe(0);
    expect(summary.firstCounts).toBe(1);
  });

  it("nets the value of the save, gains against losses", () => {
    const summary = summarizeAuditLines([
      line(10, 12, 50), // +2 kg → +₹100
      line(10, 8, 30), // −2 kg → −₹60
    ]);
    expect(summary.netCost).toBe(40);
    expect(summary.unvaluedRows).toBe(0);
  });

  it("nets what it can and reports what it could not value", () => {
    const summary = summarizeAuditLines([
      line(10, 12, 50), // +₹100
      line(10, 8), // unpriced
      line(null, 4, 50), // first count — nothing to value
    ]);
    expect(summary.netCost).toBe(100);
    expect(summary.unvaluedRows).toBe(2);
  });

  it("says nothing could be valued rather than reporting zero", () => {
    const summary = summarizeAuditLines([line(10, 12), line(10, 8)]);
    expect(summary.netCost).toBeNull();
    expect(summary.unvaluedRows).toBe(2);
  });

  it("handles an empty save", () => {
    expect(summarizeAuditLines([])).toEqual({
      rowCount: 0,
      increases: 0,
      decreases: 0,
      unchanged: 0,
      firstCounts: 0,
      netCost: null,
      unvaluedRows: 0,
    });
  });
});
