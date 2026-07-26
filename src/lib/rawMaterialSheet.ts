// ExcelJS glue for the raw-material import/export.
//
// Server-only: ExcelJS is a Node library, so these run inside route handlers.
// The reconciliation rules live in src/lib/rawMaterials.ts (pure, tested) —
// this file only turns workbooks into rows and rows into workbooks.

import ExcelJS from "exceljs";
import {
  REQUIRED_SHEET_COLUMNS,
  SHEET_COLUMNS,
  type ImportRowError,
  type RawMaterial,
  type SheetRow,
} from "@/lib/rawMaterials";
import { addHeader, applyWidths, readSheetRows } from "@/lib/sheetUtils";

const SHEET_NAME = "Raw Materials";

/** Column widths that fit the header text plus typical values. */
const COLUMN_WIDTHS = [28, 18, 18, 18, 16, 18, 24, 14];

/** The workbook the export and template endpoints both build on. */
function newWorkbook(): { wb: ExcelJS.Workbook; sheet: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET_NAME);
  addHeader(sheet, SHEET_COLUMNS);
  applyWidths(sheet, COLUMN_WIDTHS);
  return { wb, sheet };
}

/**
 * Export materials to xlsx.
 *
 * Category is written as its *name*, not its id — the sheet has to be editable
 * by a human, and the importer resolves names back to ids. Unit Conversion is
 * the bare number so a round-trip (export, edit, re-import) parses cleanly;
 * the "1 kg = 1000 gm" phrasing is presentation, and lives in the table only.
 */
export async function buildRawMaterialWorkbook(
  materials: RawMaterial[],
): Promise<Buffer> {
  const { wb, sheet } = newWorkbook();

  for (const m of materials) {
    sheet.addRow([
      m.name,
      m.categoryName ?? "",
      m.brandName ?? "",
      m.consumptionUnit,
      m.purchaseUnit,
      m.unitConversion,
      m.pricePerPurchaseUnit,
      m.alertQty,
    ]);
  }

  sheet.getColumn(7).numFmt = '#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Empty workbook with just the headers, plus one illustrative example row. */
export async function buildTemplateWorkbook(
  categoryNames: string[],
  brandNames: string[] = [],
): Promise<Buffer> {
  const { wb, sheet } = newWorkbook();

  // A sample row makes the expected shape obvious (units as text, conversion
  // and price as plain numbers). Users delete it before uploading.
  sheet.addRow([
    "Toor Dal",
    categoryNames[0] ?? "Vegetables",
    brandNames[0] ?? "",
    "gm",
    "kg",
    1000,
    120,
    500,
  ]);
  sheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  notes.addRows([
    ["How to use this template"],
    [""],
    ["1. Delete the example row on the 'Raw Materials' sheet before uploading."],
    ["2. Name is matched against existing raw materials, ignoring case and spacing."],
    ["   A match updates that material; no match creates a new one."],
    ["3. Category must be one of the existing categories listed below."],
    ["4. Brand is optional — leave it blank for unbranded items. If filled in,"],
    ["   it must match one of the existing brands listed below."],
    ["5. Unit Conversion is how many consumption units make one purchase unit."],
    ["   Example: purchase in kg, consume in gm, conversion 1000."],
    ["6. Price per Purchase Unit and Alert Qty are plain numbers, no currency symbol."],
    [""],
    ["Valid categories:"],
    ...categoryNames.map((n) => [`  ${n}`]),
    [""],
    ["Valid brands:"],
    ...(brandNames.length
      ? brandNames.map((n) => [`  ${n}`])
      : [["  (none defined yet — leave the Brand column blank)"]]),
  ]);
  notes.getRow(1).font = { bold: true, size: 14 };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an uploaded workbook into header-keyed rows.
 *
 * Headers are matched case- and whitespace-insensitively so a sheet with
 * "PRICE PER PURCHASE UNIT" still lands. Fully blank rows are dropped — Excel
 * commonly leaves trailing empties behind, and they would otherwise each
 * produce a spurious "Name is required" error.
 */
export async function parseRawMaterialWorkbook(
  data: ArrayBuffer,
): Promise<{ rows: SheetRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { rows: [], error: "Could not read that file — is it a valid .xlsx?" };
  }

  const sheet =
    wb.getWorksheet(SHEET_NAME) ?? wb.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) return { rows: [], error: "The workbook has no sheets" };

  // Brand is deliberately absent from the required set — see
  // REQUIRED_SHEET_COLUMNS. A sheet without a Brand column imports fine;
  // those rows are unbranded.
  return readSheetRows(sheet, SHEET_COLUMNS, REQUIRED_SHEET_COLUMNS);
}

/** Error report for the rows the importer refused, downloadable from the UI. */
export async function buildErrorReportWorkbook(
  errors: ImportRowError[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Errors");
  addHeader(sheet, ["Row", "Name", "Problem"]);
  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 50;
  for (const e of errors) sheet.addRow([e.rowNumber, e.name, e.message]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
