// ExcelJS glue for the category-wise sales report download.
//
// Server-only: ExcelJS is a Node library, so this runs inside a route handler.
// The rollup itself lives in src/lib/categorySales.ts (pure, tested) — this
// file only lays the result out on a worksheet.

import ExcelJS from "exceljs";
import { applyWidths } from "@/lib/sheetUtils";
import type { CategorySalesReport } from "@/lib/categorySales";

const SHEET_NAME = "Category Wise";

const COLUMNS = ["Category", "Item", "Qty", "Revenue"] as const;

/** Category and item names run long; the two numeric columns need little. */
const COLUMN_WIDTHS = [28, 42, 10, 16];

/** Rupees with paise — the report is read next to a Petpooja one. */
const MONEY_FMT = '"₹"#,##0.00';

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** yyyy-mm-dd -> "16 Aug 2026". Plain string surgery; no timezone involved. */
function readableDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export interface CategorySalesSheetMeta {
  /** Inclusive IST range the report covers, yyyy-mm-dd. */
  from: string;
  to: string;
  /** IST wall-clock stamp for the "generated at" line. */
  generatedAt: string;
}

/**
 * Lay the rollup out as one sheet: a title block, then per category a heading
 * row, its items, and a subtotal — closing on a grand total.
 *
 * Quantities and revenue are written as numbers, not pre-formatted strings, so
 * the recipient can sum and pivot them. Only the display format is applied.
 */
export async function buildCategorySalesWorkbook(
  report: CategorySalesReport,
  meta: CategorySalesSheetMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET_NAME);
  applyWidths(sheet, COLUMN_WIDTHS);

  sheet.addRow(["Sales Report — Category Wise"]);
  sheet.getRow(1).font = { bold: true, size: 14 };

  const period =
    meta.from === meta.to
      ? readableDate(meta.from)
      : `${readableDate(meta.from)} – ${readableDate(meta.to)}`;
  sheet.addRow([`Period: ${period}`]);
  sheet.addRow([`Generated: ${meta.generatedAt} IST`]);
  sheet.addRow([
    "Revenue is pre-tax and pre-discount — item prices as sold. Paid orders only.",
  ]);
  for (const r of [2, 3, 4]) {
    sheet.getRow(r).font = { color: { argb: "FF888888" }, size: 10 };
  }
  sheet.addRow([]);

  const headerRowNumber = sheet.rowCount + 1;
  const header = sheet.addRow([...COLUMNS]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  header.getCell(3).alignment = { horizontal: "right" };
  header.getCell(4).alignment = { horizontal: "right" };
  // Keep the column names in view when scrolling a long menu.
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

  for (const category of report.categories) {
    const categoryRow = sheet.addRow([category.name]);
    categoryRow.font = { bold: true };

    for (const item of category.items) {
      const row = sheet.addRow(["", item.name, item.quantity, item.revenue]);
      row.getCell(4).numFmt = MONEY_FMT;
    }

    const subtotal = sheet.addRow([
      "",
      "Subtotal",
      category.quantity,
      category.revenue,
    ]);
    subtotal.font = { italic: true };
    subtotal.getCell(4).numFmt = MONEY_FMT;
    // A little air before the next category heading.
    sheet.addRow([]);
  }

  if (report.categories.length === 0) {
    const empty = sheet.addRow(["", "No sales in this period"]);
    empty.font = { italic: true, color: { argb: "FF888888" } };
    sheet.addRow([]);
  }

  const total = sheet.addRow([
    "GRAND TOTAL",
    "",
    report.totals.quantity,
    report.totals.revenue,
  ]);
  total.font = { bold: true };
  total.getCell(4).numFmt = MONEY_FMT;
  total.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
