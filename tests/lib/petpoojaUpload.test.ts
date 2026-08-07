import { describe, expect, it } from "vitest";
import {
  parsePetpoojaRows,
  totalQty,
  type PetpoojaSheetRow,
} from "@/lib/petpoojaUpload";

const row = (name: unknown, qty: unknown): PetpoojaSheetRow => ({
  "Item Name": name,
  Qty: qty,
});

/** Sheet row numbers: data starts on row 2, under the header. */
const rowNumber = (_row: PetpoojaSheetRow, index: number) => index + 2;

const parse = (rows: PetpoojaSheetRow[]) => parsePetpoojaRows(rows, rowNumber);

describe("parsePetpoojaRows", () => {
  it("reads a clean sheet", () => {
    expect(parse([row("Dal Rice", 12), row("Jeera Rice", 5)])).toEqual({
      items: [
        { name: "Dal Rice", nameKey: "dal rice", qty: 12 },
        { name: "Jeera Rice", nameKey: "jeera rice", qty: 5 },
      ],
      errors: [],
      rowsRead: 2,
    });
  });

  it("sums an item listed more than once", () => {
    const { items } = parse([
      row("Dal Rice", 12),
      row("dal  rice", 3),
      row("Dal Rice.", 1),
    ]);

    expect(items).toEqual([{ name: "Dal Rice", nameKey: "dal rice", qty: 16 }]);
  });

  it("records the first spelling seen", () => {
    const { items } = parse([row("  DAL   rice ", 2), row("Dal Rice", 1)]);

    expect(items[0].name).toBe("DAL rice");
  });

  it("accepts quantities written as text", () => {
    const { items, errors } = parse([row("Dal Rice", " 1,200 "), row("Papad", "2.5")]);

    expect(errors).toEqual([]);
    expect(items.map((i) => i.qty)).toEqual([1200, 2.5]);
  });

  it("keeps a summed decimal free of float noise", () => {
    const { items } = parse([row("Papad", 0.1), row("Papad", 0.2)]);

    expect(items[0].qty).toBe(0.3);
  });

  it("skips a row with no item name, pointing at the sheet row", () => {
    const { items, errors } = parse([row("Dal Rice", 1), row("   ", 5)]);

    expect(items).toHaveLength(1);
    expect(errors).toEqual([
      { rowNumber: 3, name: "", reason: "Item name is required" },
    ]);
  });

  it("skips a quantity that is not a number", () => {
    const { errors } = parse([row("Dal Rice", "two")]);

    expect(errors).toEqual([
      { rowNumber: 2, name: "Dal Rice", reason: "Qty must be a number" },
    ]);
  });

  it("skips a missing, zero or negative quantity", () => {
    const { items, errors } = parse([
      row("A", ""),
      row("B", 0),
      row("C", -4),
    ]);

    expect(items).toEqual([]);
    expect(errors.map((e) => e.reason)).toEqual([
      "Qty must be a number",
      "Qty must be greater than 0",
      "Qty must be greater than 0",
    ]);
  });

  it("keeps the good rows when some are bad", () => {
    const { items, errors, rowsRead } = parse([
      row("Dal Rice", 12),
      row("", 3),
      row("Papad", 4),
    ]);

    expect(items.map((i) => i.name)).toEqual(["Dal Rice", "Papad"]);
    expect(errors).toHaveLength(1);
    expect(rowsRead).toBe(3);
  });

  it("has nothing to record for an empty sheet", () => {
    expect(parse([])).toEqual({ items: [], errors: [], rowsRead: 0 });
  });
});

describe("parsePetpoojaRows — variants", () => {
  const sized = (
    name: unknown,
    variant: unknown,
    qty: unknown,
  ): PetpoojaSheetRow => ({ "Item Name": name, Variant: variant, Qty: qty });

  it("records the size a row was sold in", () => {
    const { items } = parse([sized("Dal Thali", " LARGE ", 3)]);

    expect(items).toEqual([
      {
        name: "Dal Thali",
        nameKey: "dal thali",
        variantName: "LARGE",
        variantKey: "large",
        qty: 3,
      },
    ]);
  });

  it("keeps two sizes of one item apart", () => {
    const { items } = parse([
      sized("Dal Thali", "Small", 3),
      sized("Dal Thali", "Large", 2),
    ]);

    expect(items.map((i) => [i.variantName, i.qty])).toEqual([
      ["Small", 3],
      ["Large", 2],
    ]);
  });

  it("sums one size listed more than once", () => {
    const { items } = parse([
      sized("Dal Thali", "Large", 3),
      sized("dal  thali", "large", 2),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
    // First spelling wins for the size too, as it does for the name.
    expect(items[0].variantName).toBe("Large");
  });

  it("keeps a sized line apart from the same item sold without one", () => {
    const { items } = parse([
      row("Dal Thali", 4),
      sized("Dal Thali", "Large", 2),
    ]);

    expect(items.map((i) => [i.variantName, i.qty])).toEqual([
      [undefined, 4],
      ["Large", 2],
    ]);
  });

  it("stores no size at all when the column is blank", () => {
    const { items } = parse([sized("Dal Rice", "   ", 1)]);

    expect(items[0]).not.toHaveProperty("variantName");
    expect(items[0]).not.toHaveProperty("variantKey");
  });
});

describe("totalQty", () => {
  it("adds up what an upload sold", () => {
    const { items } = parse([row("Dal Rice", 12), row("Papad", 3.5)]);

    expect(totalQty(items)).toBe(15.5);
  });

  it("is zero for an upload with no items", () => {
    expect(totalQty([])).toBe(0);
  });
});
