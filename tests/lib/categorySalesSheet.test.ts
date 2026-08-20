import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCategorySalesWorkbook } from "@/lib/categorySalesSheet";
import { buildCategorySalesReport } from "@/lib/categorySales";

/** The header row of the reference workbook, verbatim. */
const REFERENCE_HEADERS = [
  "Category",
  "Total Items Ordered",
  "Net Amount (₹)",
  "Total Discount (₹)",
  "Total Tax (₹)",
  "Total Sales (₹)",
  "Net Sales (₹)(N.A - T.D)",
  "Percentage (%)",
];

/** Build a workbook and read it back the way Excel would. */
async function render(rows: Parameters<typeof buildCategorySalesWorkbook>[0]) {
  const buffer = await buildCategorySalesWorkbook(rows);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buffer).buffer as ArrayBuffer);
  const sheet = wb.getWorksheet("Category Wise");
  if (!sheet) throw new Error("no Category Wise sheet");

  const grid: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    grid.push([1, 2, 3, 4, 5, 6, 7, 8].map((c) => row.getCell(c).value));
  });
  return { sheet, grid };
}

const SAMPLE = buildCategorySalesReport(
  [
    {
      discount: 216.7,
      tax: 85.88,
      lines: [{ productId: "curry", quantity: 7, revenue: 1934 }],
    },
    {
      discount: 1136.5,
      tax: 255.06,
      lines: [{ productId: "rice", quantity: 22, revenue: 6237 }],
    },
  ],
  new Map([
    ["curry", "Indian Curries"],
    ["rice", "Fried Rice Bowls"],
  ]),
);

describe("buildCategorySalesWorkbook", () => {
  it("puts the calculation notes above the columns they explain", async () => {
    const { grid } = await render(SAMPLE);
    // Category and the item count need no explanation, so those two sit blank.
    expect(grid[0][0] ?? "").toBe("");
    expect(grid[0][1] ?? "").toBe("");
    expect(grid[0][2]).toBe("Total Items*Price of that item");
    expect(grid[0][3]).toBe("Total Discount= Location+Coupon+Reward");
    expect(grid[0][5]).toBe("Total Sales= Net Amount -Discount+ Tax)");
    expect(grid[0][6]).toBe("Net Sales= Net Amount-Discount");
    expect(grid[0][7]).toBe(
      "Percentage= (Net sales of any category/Sum of net sales)*100",
    );
  });

  it("matches the reference workbook's headers exactly, on row 2", async () => {
    const { grid } = await render(SAMPLE);
    expect(grid[1]).toEqual(REFERENCE_HEADERS);
  });

  it("writes one row per category, starting at row 3", async () => {
    const { grid } = await render(SAMPLE);
    // Fried Rice earns more, so it ranks first.
    expect(grid[2]).toEqual([
      "Fried Rice Bowls",
      22,
      6237,
      1136.5,
      255.06,
      5355.56,
      5100.5,
      74.81,
    ]);
    expect(grid[3]).toEqual([
      "Indian Curries",
      7,
      1934,
      216.7,
      85.88,
      1803.18,
      1717.3,
      25.19,
    ]);
    expect(grid).toHaveLength(4); // notes + headers + two categories, nothing else
  });

  it("writes every figure as a number so the columns can be summed", async () => {
    // The failure this guards: pre-formatting "₹1,934" makes the cell text, and
    // a downstream pivot's total silently reads 0.
    const { grid } = await render(SAMPLE);
    for (const cell of grid[2].slice(1)) {
      expect(typeof cell).toBe("number");
    }
  });

  it("shows no item rows, subtotals or grand total", async () => {
    const { grid } = await render(SAMPLE);
    const firstColumn = grid.map((r) => String(r[0] ?? ""));
    expect(firstColumn).not.toContain("Subtotal");
    expect(firstColumn).not.toContain("GRAND TOTAL");
  });

  it("freezes the notes and headers so they stay in view", async () => {
    const { sheet } = await render(SAMPLE);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
  });

  it("still produces a headed sheet for a range with no sales", async () => {
    const { grid } = await render([]);
    expect(grid[1]).toEqual(REFERENCE_HEADERS);
    expect(grid).toHaveLength(2);
  });
});
