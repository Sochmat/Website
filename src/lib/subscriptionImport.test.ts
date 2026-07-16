import { describe, it, expect } from "vitest";
import {
  normalizeName,
  parseBracketSheet,
  bracketForSheet,
  type Cell,
} from "./subscriptionImport";
import { SHEET_25_30, SHEET_30_40, SHEET_40_50 } from "./subscriptionImport.fixture";

describe("normalizeName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeName("  Moong  Daal   Wrap ")).toBe("moong daal wrap");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeName("Paneer Bowl.")).toBe("paneer bowl");
    expect(normalizeName("Paneer Bowl,,")).toBe("paneer bowl");
  });

  it("is idempotent", () => {
    const once = normalizeName("  Chcken loaded omellte  ");
    expect(normalizeName(once)).toBe(once);
  });
});

describe("bracketForSheet", () => {
  it("maps the three real sheet names", () => {
    expect(bracketForSheet("Sochmat (25-30g)")).toBe("25-30");
    expect(bracketForSheet("Sochmat (30-40g)")).toBe("30-40");
    expect(bracketForSheet("Sochmat (40-50g)")).toBe("40-50");
  });

  it("returns null for the Zomato sheet and anything unknown", () => {
    expect(bracketForSheet("Zomato")).toBeNull();
    expect(bracketForSheet("Sheet1")).toBeNull();
  });
});

describe("parseBracketSheet — real sheets", () => {
  it.each([
    ["Sochmat (25-30g)", SHEET_25_30, 19, 188, 198, 3],
    ["Sochmat (30-40g)", SHEET_30_40, 19, 250, 272, 7],
    ["Sochmat (40-50g)", SHEET_40_50, 16, 300, 340, 0],
  ])(
    "%s → %i items, ₹%i veg / ₹%i non-veg, %i needing protein",
    (name, rows, count, veg, nonVeg, missingProtein) => {
      const sheet = parseBracketSheet(rows as Cell[][], name as string);
      expect(sheet.items).toHaveLength(count as number);
      expect(sheet.vegPrice).toBe(veg);
      expect(sheet.nonVegPrice).toBe(nonVeg);
      expect(sheet.items.filter((i) => i.protein === null)).toHaveLength(
        missingProtein as number,
      );
    },
  );

  it("imports 54 items and 10 protein-less rows across all three sheets", () => {
    const all = [
      parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)"),
      parseBracketSheet(SHEET_30_40, "Sochmat (30-40g)"),
      parseBracketSheet(SHEET_40_50, "Sochmat (40-50g)"),
    ].flatMap((s) => s.items);

    expect(all).toHaveLength(54);
    expect(all.filter((i) => i.protein === null)).toHaveLength(10);
  });

  it("splits veg from non-veg at the first Final Pricing row", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    expect(items.filter((i) => i.isVeg)).toHaveLength(9);
    expect(items.filter((i) => !i.isVeg)).toHaveLength(10);
    expect(items[0].name).toBe("Moong Daal Soya Keema Wrap");
    expect(items[0].isVeg).toBe(true);
    expect(items[8].name).toBe("paneer fried rice (regular)");
    expect(items[8].isVeg).toBe(true);
    expect(items[9].name).toBe("Moong Daal Chicken Wrap");
    expect(items[9].isVeg).toBe(false);
  });

  it("classifies egg items as non-veg — they live in the second block", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    const egg = items.find((i) => i.name === "Egg Protein Power Burger");
    expect(egg!.isVeg).toBe(false);
  });

  it("skips the unlabelled aggregate row rather than importing a nameless item", () => {
    const { items } = parseBracketSheet(SHEET_30_40, "Sochmat (30-40g)");
    expect(items.every((i) => i.name.trim().length > 0)).toBe(true);
    expect(items.find((i) => i.referencePrice === 231.25)).toBeUndefined();
  });

  it('skips the discount row "295 -15%" despite the missing space', () => {
    const { items } = parseBracketSheet(SHEET_30_40, "Sochmat (30-40g)");
    expect(items.find((i) => i.name.includes("%"))).toBeUndefined();
    expect(items.find((i) => i.referencePrice === 266)).toBeUndefined();
  });

  it("skips both discount rows in a sheet that has one per block", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    expect(items.find((i) => i.name.startsWith("210"))).toBeUndefined();
    expect(items.find((i) => i.name.startsWith("220"))).toBeUndefined();
  });

  it("preserves the source name verbatim, typos and trailing spaces included", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    const typo = items.find((i) => i.name === "Chcken loaded omellte ");
    expect(typo).toBeDefined();
    expect(typo!.protein).toBeNull();
    expect(typo!.referencePrice).toBe(161.4285714);
    expect(typo!.nameKey).toBe("chcken loaded omellte");
    expect(typo!.importKey).toBe("chcken loaded omellte");
  });

  it("keeps Mexican Chicken Burrito Bowl (Regular) visible — it does have protein", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    const it_ = items.find((i) => i.name === "Mexican Chicken Burrito Bowl (Regular)");
    expect(it_!.protein).toBe(26.2);
    expect(it_!.referencePrice).toBe(230);
  });

  it("keeps a price even when protein is absent", () => {
    const { items } = parseBracketSheet(SHEET_30_40, "Sochmat (30-40g)");
    const rice = items.find((i) => i.name === "Paneer fried rice (large)");
    expect(rice!.protein).toBeNull();
    expect(rice!.referencePrice).toBe(250);
  });

  it("assigns a stable ascending sortOrder", () => {
    const { items } = parseBracketSheet(SHEET_40_50, "Sochmat (40-50g)");
    expect(items.map((i) => i.sortOrder)).toEqual(items.map((_, i) => i));
  });

  it("records the source row number for error reporting", () => {
    const { items } = parseBracketSheet(SHEET_25_30, "Sochmat (25-30g)");
    expect(items[0].rowNumber).toBe(2); // 1-indexed; row 1 is the header
  });
});

describe("parseBracketSheet — malformed input", () => {
  const header: Cell = "Item Name";

  it("throws when a sheet has only one Final Pricing row", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Veg Thing", 30, 100],
          ["Final Pricing. - 188", null, null],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow(/expected 2 "Final Pricing" rows/i);
  });

  it("throws when a sheet has three Final Pricing rows", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Veg Thing", 30, 100],
          ["Final Pricing. - 188", null, null],
          ["Non Veg Thing", 30, 100],
          ["Final Pricing. - 198", null, null],
          ["Final Pricing. - 208", null, null],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow(/expected 2 "Final Pricing" rows/i);
  });

  it("throws when an item appears after the second Final Pricing row", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Veg Thing", 30, 100],
          ["Final Pricing. - 188", null, null],
          ["Non Veg Thing", 30, 100],
          ["Final Pricing. - 198", null, null],
          ["Stray Item", 30, 100],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow(/row 6/i);
  });

  it("throws on a duplicate importKey within a sheet", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Paneer Bowl", 30, 100],
          ["  paneer   bowl. ", 30, 100],
          ["Final Pricing. - 188", null, null],
          ["Non Veg Thing", 30, 100],
          ["Final Pricing. - 198", null, null],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow(/duplicate/i);
  });

  it("throws on a non-positive final price", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Veg Thing", 30, 100],
          ["Final Pricing. - 0", null, null],
          ["Non Veg Thing", 30, 100],
          ["Final Pricing. - 198", null, null],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow(/price/i);
  });

  it("throws when a Final Pricing row carries no number", () => {
    expect(() =>
      parseBracketSheet(
        [
          [header, "Protein", "price"],
          ["Veg Thing", 30, 100],
          ["Final Pricing. - TBD", null, null],
          ["Non Veg Thing", 30, 100],
          ["Final Pricing. - 198", null, null],
        ],
        "Sochmat (25-30g)",
      ),
    ).toThrow();
  });

  it("names the sheet in every error", () => {
    expect(() =>
      parseBracketSheet([[header, "Protein", "price"]], "Sochmat (40-50g)"),
    ).toThrow(/Sochmat \(40-50g\)/);
  });
});
