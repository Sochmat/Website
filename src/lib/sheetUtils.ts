// Shared ExcelJS glue for the inventory import/export endpoints.
//
// Server-only: ExcelJS is a Node library, so everything here runs inside route
// handlers. Reconciliation rules live in the pure modules (rawMaterials.ts,
// recipeImport.ts) — this file only turns worksheets into rows and back.

import ExcelJS from "exceljs";
import type { SheetRow } from "@/lib/rawMaterials";

/**
 * The real 1-indexed worksheet row a parsed row came from, stashed under a key
 * no header can collide with.
 *
 * Blank rows are dropped during parsing, so the position in the returned array
 * stops matching what the user sees in Excel as soon as a sheet has a gap in
 * it. Carrying the true number keeps the error report actionable.
 */
export const ROW_NUMBER_KEY = "__rowNumber";

/** Bold, shaded, frozen header row. */
export function addHeader(
  sheet: ExcelJS.Worksheet,
  columns: readonly string[],
) {
  sheet.addRow([...columns]);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    };
  });
  // Keep headers visible when scrolling a long sheet.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** Column widths, positionally; anything unlisted falls back to a sane default. */
export function applyWidths(
  sheet: ExcelJS.Worksheet,
  widths: readonly number[],
  fallback = 18,
) {
  widths.forEach((_, i) => {
    sheet.getColumn(i + 1).width = widths[i] ?? fallback;
  });
}

/**
 * ExcelJS returns `{ formula, result }` for computed cells and `{ richText }`
 * for styled ones. Reduce everything to the plain value the parsers expect.
 */
export function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return (v as { result?: unknown }).result ?? "";
    if ("richText" in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((t) => t.text)
        .join("");
    }
    if ("text" in v) return (v as { text?: unknown }).text ?? "";
    if (v instanceof Date) return v.toISOString();
  }
  return v;
}

/** Case- and whitespace-insensitive, so "PRICE  PER UNIT" still matches. */
function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Read a worksheet into header-keyed rows.
 *
 * Only `columns` are picked up; unknown columns are ignored so a user can keep
 * their own notes alongside. Fully blank rows are dropped — Excel commonly
 * leaves trailing empties behind, and they would each otherwise produce a
 * spurious "Name is required".
 */
export function readSheetRows(
  sheet: ExcelJS.Worksheet,
  columns: readonly string[],
  requiredColumns: readonly string[],
): { rows: SheetRow[]; error?: string } {
  const canonicalByNormalized = new Map(
    columns.map((c) => [normalizeHeader(c), c]),
  );

  // worksheet column index -> canonical header name
  const columnMap = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const canonical = canonicalByNormalized.get(
      normalizeHeader(String(cellValue(cell) ?? "")),
    );
    if (canonical) columnMap.set(colNumber, canonical);
  });

  const present = [...columnMap.values()];
  const missing = requiredColumns.filter((c) => !present.includes(c));
  if (missing.length) {
    return {
      rows: [],
      error: `"${sheet.name}" is missing column${
        missing.length > 1 ? "s" : ""
      }: ${missing.join(", ")}`,
    };
  }

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const parsed: SheetRow = { [ROW_NUMBER_KEY]: rowNumber };
    let hasValue = false;
    columnMap.forEach((header, colNumber) => {
      const value = cellValue(row.getCell(colNumber));
      parsed[header] = value;
      if (String(value ?? "").trim() !== "") hasValue = true;
    });
    if (hasValue) rows.push(parsed);
  });

  return { rows };
}
