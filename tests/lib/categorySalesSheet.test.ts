import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCategorySalesWorkbook } from "@/lib/categorySalesSheet";
import { groupByCategory } from "@/lib/categorySales";
import type { ItemSale } from "@/lib/adminItemSales";

const NAMES = new Map([
  ["biryani", "Biryani"],
  ["bev", "Beverages"],
]);

const sale = (over: Partial<ItemSale>): ItemSale => ({
  productId: "p",
  name: "Item",
  isVeg: true,
  category: "biryani",
  quantity: 1,
  revenue: 100,
  ...over,
});

const META = {
  from: "2026-08-10",
  to: "2026-08-16",
  generatedAt: "16 Aug 2026, 18:34:52",
};

/** Build a workbook and read it back the way Excel would. */
async function render(items: ItemSale[], meta = META) {
  const buffer = await buildCategorySalesWorkbook(
    groupByCategory(items, NAMES),
    meta,
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buffer).buffer as ArrayBuffer);
  const sheet = wb.getWorksheet("Category Wise");
  if (!sheet) throw new Error("no Category Wise sheet");

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(
      [1, 2, 3, 4].map((c) => {
        const v = row.getCell(c).value;
        return v === null || v === undefined ? "" : String(v);
      }),
    );
  });
  return { sheet, rows };
}

describe("buildCategorySalesWorkbook", () => {
  it("lays out categories, their items, subtotals and a grand total", async () => {
    const { rows } = await render([
      sale({ productId: "a", name: "Chicken Biryani", quantity: 42, revenue: 12600 }),
      sale({ productId: "b", name: "Veg Biryani", quantity: 18, revenue: 4320 }),
      sale({ productId: "c", name: "Masala Chai", category: "bev", quantity: 95, revenue: 2375 }),
    ]);

    const flat = rows.map((r) => r.join("|"));
    expect(flat).toContain("Biryani|||");
    expect(flat).toContain("|Chicken Biryani|42|12600");
    expect(flat).toContain("|Veg Biryani|18|4320");
    expect(flat).toContain("|Subtotal|60|16920");
    expect(flat).toContain("Beverages|||");
    expect(flat).toContain("|Masala Chai|95|2375");
    expect(flat).toContain("|Subtotal|95|2375");
    expect(flat).toContain("GRAND TOTAL||155|19295");
  });

  it("carries the period and the caveat in the title block", async () => {
    const { rows } = await render([sale({})]);
    const head = rows.slice(0, 4).map((r) => r[0]);
    expect(head[0]).toBe("Sales Report — Category Wise");
    expect(head[1]).toBe("Period: 10 Aug 2026 – 16 Aug 2026");
    expect(head[2]).toBe("Generated: 16 Aug 2026, 18:34:52 IST");
    expect(head[3]).toContain("pre-tax");
  });

  it("collapses the period to one date for a single-day report", async () => {
    const { rows } = await render([sale({})], {
      ...META,
      from: "2026-08-16",
      to: "2026-08-16",
    });
    expect(rows[1][0]).toBe("Period: 16 Aug 2026");
  });

  it("writes money as numbers so the recipient can sum them", async () => {
    // The failure this guards: pre-formatting "₹12,600" makes every revenue
    // cell text, and the totals row of a downstream pivot silently reads 0.
    const { sheet } = await render([
      sale({ name: "Chicken Biryani", quantity: 42, revenue: 12600.5 }),
    ]);

    let checked = false;
    sheet.eachRow((row) => {
      if (String(row.getCell(2).value ?? "") !== "Chicken Biryani") return;
      expect(typeof row.getCell(3).value).toBe("number");
      expect(row.getCell(4).value).toBe(12600.5);
      expect(row.getCell(4).numFmt).toContain("₹");
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it("freezes the header row so it stays visible down a long menu", async () => {
    const { sheet, rows } = await render([sale({})]);
    const headerRow = rows.findIndex((r) => r[0] === "Category") + 1;
    expect(headerRow).toBeGreaterThan(1);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: headerRow });
  });

  it("still produces a readable sheet for a range with no sales", async () => {
    const { rows } = await render([]);
    const flat = rows.map((r) => r.join("|"));
    expect(flat.some((r) => r.includes("No sales in this period"))).toBe(true);
    expect(flat).toContain("GRAND TOTAL||0|0");
  });
});
