// ExcelJS glue for the Petpooja item-list upload.
//
// Server-only: ExcelJS is a Node library, so these run inside route handlers.
// The rules live in src/lib/petpoojaUpload.ts (pure, tested) — this file only
// turns a workbook into rows and builds the sample one to download.

import ExcelJS from "exceljs";
import {
  PETPOOJA_SHEET_COLUMNS,
  type PetpoojaSheetRow,
} from "@/lib/petpoojaUpload";
import { addHeader, applyWidths, readSheetRows } from "@/lib/sheetUtils";

const SHEET_NAME = "Items";

/** Wide enough for a long dish name; Qty needs almost nothing. */
const COLUMN_WIDTHS = [40, 12];

/** The sample file the Petpooja tab offers for download. */
export async function buildPetpoojaTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(SHEET_NAME);
  addHeader(sheet, PETPOOJA_SHEET_COLUMNS);
  applyWidths(sheet, COLUMN_WIDTHS);

  // Sample rows make the expected shape obvious: the name as it reads on the
  // menu, the quantity as a plain number. Users delete them before uploading.
  sheet.addRows([
    ["Dal Rice", 12],
    ["Jeera Rice", 5],
  ]);
  sheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };
  sheet.getRow(3).font = { italic: true, color: { argb: "FF888888" } };

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  notes.addRows([
    ["How to use this template"],
    [""],
    ["1. Delete the two example rows on the 'Items' sheet before uploading."],
    ["2. Item Name is the item as it appears on the menu. Case and extra"],
    ["   spacing do not matter."],
    ["3. Qty is a plain number greater than 0 — no units, no currency."],
    ["4. An item listed more than once is added up into a single line."],
    ["5. Extra columns of your own are ignored, so you can keep notes alongside."],
    ["6. Each upload is saved as its own dated entry; uploading again does not"],
    ["   overwrite what came before."],
  ]);
  notes.getRow(1).font = { bold: true, size: 14 };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an uploaded workbook into header-keyed rows.
 *
 * The sheet named "Items" is preferred, but any first non-empty sheet will do:
 * a POS export rarely names its sheet what we would.
 */
export async function parsePetpoojaWorkbook(
  data: ArrayBuffer,
): Promise<{ rows: PetpoojaSheetRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { rows: [], error: "Could not read that file — is it a valid .xlsx?" };
  }

  const sheet =
    wb.getWorksheet(SHEET_NAME) ?? wb.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) return { rows: [], error: "The workbook has no sheets" };

  return readSheetRows(sheet, PETPOOJA_SHEET_COLUMNS, PETPOOJA_SHEET_COLUMNS);
}
