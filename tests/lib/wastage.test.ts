import { describe, expect, it } from "vitest";
import { buildWastage, parseWastageQty } from "@/lib/wastage";

describe("buildWastage", () => {
  it("takes the quantity off what is on record", () => {
    expect(
      buildWastage({ qty: 250, previousStock: 1000, unitCost: 0.09 }),
    ).toEqual({
      qty: 250,
      closingStock: 750,
      shortfall: 0,
      unitCost: 0.09,
      cost: 22.5,
    });
  });

  it("goes into the red and keeps the uncovered part as a shortfall", () => {
    // Not floored at zero: the food went in the bin, and resetting the shelf
    // to 0 would forgive a debt the next delivery has to settle.
    const movement = buildWastage({ qty: 500, previousStock: 200 });
    expect(movement.closingStock).toBe(-300);
    expect(movement.shortfall).toBe(300);
  });

  it("treats an untracked item as empty — the whole wastage is a shortfall", () => {
    const movement = buildWastage({ qty: 5, previousStock: null });
    expect(movement.closingStock).toBe(-5);
    expect(movement.shortfall).toBe(5);
  });

  it("never raises stock that is already in the red", () => {
    // Flooring used to hand this item 50 gm back. Binning food cannot put
    // stock onto a shelf.
    const movement = buildWastage({ qty: 10, previousStock: -50 });
    expect(movement.closingStock).toBe(-60);
  });

  it("blames a wastage only for the part IT could not cover", () => {
    // The item was already 50 short before this. A 10 gm wastage is 10 gm
    // short, not 60 — the same rule buildConsumptionLine applies.
    const movement = buildWastage({ qty: 10, previousStock: -50 });
    expect(movement.shortfall).toBe(10);
  });

  it("values the full wasted quantity, not just the covered part", () => {
    // 300 of the 500 was never on the books, but it still went in the bin.
    expect(buildWastage({ qty: 500, previousStock: 200, unitCost: 2 }).cost).toBe(
      1000,
    );
  });

  it("reports no cost when the item cannot be valued", () => {
    expect(buildWastage({ qty: 10, previousStock: 100 }).cost).toBeNull();
    expect(
      buildWastage({ qty: 10, previousStock: 100, unitCost: 0 }).cost,
    ).toBeNull();
  });

  it("keeps float noise out of the quantities", () => {
    const movement = buildWastage({ qty: 0.1, previousStock: 0.3 });
    expect(movement.closingStock).toBe(0.2);
  });
});

describe("parseWastageQty", () => {
  it("accepts numbers and numeric strings", () => {
    expect(parseWastageQty(12.5)).toEqual({ value: 12.5 });
    expect(parseWastageQty("1,000")).toEqual({ value: 1000 });
  });

  it("rejects zero — nothing was thrown away", () => {
    expect(parseWastageQty(0).error).toBeTruthy();
    expect(parseWastageQty(0).value).toBeUndefined();
  });

  it("rejects blanks, junk and negatives", () => {
    expect(parseWastageQty("").error).toBeTruthy();
    expect(parseWastageQty("abc").error).toBeTruthy();
    expect(parseWastageQty(-1).error).toBeTruthy();
    expect(parseWastageQty(undefined).error).toBeTruthy();
  });
});
