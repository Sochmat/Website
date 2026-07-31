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

describe("totalQty", () => {
  it("adds up what an upload sold", () => {
    const { items } = parse([row("Dal Rice", 12), row("Papad", 3.5)]);

    expect(totalQty(items)).toBe(15.5);
  });

  it("is zero for an upload with no items", () => {
    expect(totalQty([])).toBe(0);
  });
});
