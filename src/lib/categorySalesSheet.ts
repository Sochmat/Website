// ExcelJS glue for the category-wise sales report download.
//
// Server-only: ExcelJS is a Node library, so this runs inside a route handler.
// The rollup itself lives in src/lib/categorySales.ts (pure, tested) — this
// file only lays the result out on a worksheet.

import ExcelJS from "exceljs";
import { applyWidths } from "@/lib/sheetUtils";
import type { CategorySalesRow } from "@/lib/categorySales";

const SHEET_NAME = "Category Wise";

/**
 * Row 1 of the reference workbook: how each column is arrived at, sitting above
 * the column it explains. Column A and B need none — a category is a category,
 * and the item count is a count.
 */
const FORMULA_NOTES = [
  "",
  "",
  "Total Items*Price of that item",
  "Total Discount= Location+Coupon+Reward",
  "Total Tax ",
  "Total Sales= Net Amount -Discount+ Tax)",
  "Net Sales= Net Amount-Discount",
  "Percentage= (Net sales of any category/Sum of net sales)*100",
] as const;

const COLUMNS = [
  "Category",
  "Total Items Ordered",
  "Net Amount (₹)",
  "Total Discount (₹)",
  "Total Tax (₹)",
  "Total Sales (₹)",
  "Net Sales (₹)(N.A - T.D)",
  "Percentage (%)",
] as const;

/** Taken from the reference workbook so the two open identically. */
const COLUMN_WIDTHS = [24, 17.89, 25.78, 36.55, 11.33, 34.89, 28.11, 52.33];

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

/**
 * Lay the rollup out as one sheet: the formula notes, the header row, then one
 * row per category — no item breakdown, no subtotals, no grand total.
 *
 * Every figure is written as a number, not a pre-formatted string, so the
 * recipient can sum and pivot the columns. The ₹ lives in the header, matching
 * the reference, so the cells stay plain.
 */
export async function buildCategorySalesWorkbook(
  rows: CategorySalesRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET_NAME);
  applyWidths(sheet, COLUMN_WIDTHS);

  const notes = sheet.addRow([...FORMULA_NOTES]);
  notes.font = { italic: true, size: 9, color: { argb: "FF666666" } };
  notes.alignment = { wrapText: false, vertical: "middle" };

  const header = sheet.addRow([...COLUMNS]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  // Keep the column names in view when scrolling a long category list. Splits
  // below row 2, so the notes stay pinned with them.
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  for (const row of rows) {
    sheet.addRow([
      row.category,
      row.itemsOrdered,
      row.netAmount,
      row.discount,
      row.tax,
      row.totalSales,
      row.netSales,
      row.percentage,
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
