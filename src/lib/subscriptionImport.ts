import { BRACKET_KEYS, type ProteinBracketKey } from "./types";

/**
 * Pure parser for the bracket sheets in Subscriptions.xlsx.
 *
 * Lives under src/ (not tools/) so vitest's `src/**\/*.test.ts` glob picks up its
 * tests. The IO half — opening the workbook, talking to Mongo — is
 * tools/import-subscription-menu.ts.
 *
 * Sheet shape, per bracket:
 *   row 1            header
 *   rows 2..n        VEG items
 *   "<base> - <d>%"  discount row      (skipped)
 *   "Final Pricing. - 188"             (ends the veg block)
 *   rows ..m         NON-VEG items (egg items included)
 *   "<base> - <d>%"  discount row      (skipped)
 *   "Final Pricing. - 198"             (ends the non-veg block)
 *
 * Interleaved: blank rows, and unlabelled aggregate rows that carry numbers in
 * columns C/D/J but nothing in column A. Column A is the only reliable
 * discriminator, so it drives the state machine.
 */

export type Cell = string | number | null | undefined;

export interface ParsedItem {
  /** Verbatim from the sheet — typos and trailing spaces preserved. */
  name: string;
  nameKey: string;
  /** Immutable upsert key. Equal to nameKey at import time, then frozen. */
  importKey: string;
  /** null means the cell was blank; the importer marks such rows hidden. */
  protein: number | null;
  referencePrice: number | null;
  isVeg: boolean;
  sortOrder: number;
  /** 1-indexed source row, for error messages. */
  rowNumber: number;
}

export interface ParsedSheet {
  items: ParsedItem[];
  vegPrice: number;
  nonVegPrice: number;
}

const SHEET_TO_BRACKET: Record<string, ProteinBracketKey> = {
  "Sochmat (25-30g)": "25-30",
  "Sochmat (30-40g)": "30-40",
  "Sochmat (40-50g)": "40-50",
};

export function bracketForSheet(sheetName: string): ProteinBracketKey | null {
  const key = SHEET_TO_BRACKET[sheetName.trim()];
  return key && (BRACKET_KEYS as readonly string[]).includes(key) ? key : null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]+$/, "")
    .trim();
}

const FINAL_PRICING = /^final\s*pricing/i;
/** e.g. "210 - 10% ", "295 -15%" — starts with a number and mentions a percent. */
const DISCOUNT_ROW = /^\d/;

function lastInteger(s: string): number | null {
  const matches = s.match(/\d+/g);
  if (!matches) return null;
  return Number(matches[matches.length - 1]);
}

function num(cell: Cell): number | null {
  if (cell === null || cell === undefined || cell === "") return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
}

/**
 * `rows[0]` is the header row; each row is columns A..C (extra columns ignored).
 * Throws — with the sheet name and row number — on anything it can't account for,
 * so a reshaped spreadsheet fails the import loudly instead of silently dropping meals.
 */
export function parseBracketSheet(rows: Cell[][], sheetName: string): ParsedSheet {
  const fail = (msg: string): never => {
    throw new Error(`${sheetName}: ${msg}`);
  };

  const items: ParsedItem[] = [];
  const finals: number[] = [];
  const seen = new Map<string, number>();
  let blockIndex = 0; // 0 = veg, 1 = non-veg

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const row = rows[i] ?? [];
    const a = String(row[0] ?? "").trim();

    // Blank rows AND the unlabelled aggregate rows (numbers in C/D/J, empty A).
    if (a === "") continue;

    if (FINAL_PRICING.test(a)) {
      const price = lastInteger(a);
      if (price === null) {
        fail(`row ${rowNumber}: "Final Pricing" row carries no number: "${a}"`);
      }
      if (price! <= 0) {
        fail(`row ${rowNumber}: final price must be positive, got ${price}`);
      }
      finals.push(price!);
      blockIndex++;
      continue;
    }

    if (DISCOUNT_ROW.test(a) && a.includes("%")) continue;

    if (blockIndex > 1) {
      fail(`row ${rowNumber}: item "${a}" appears after the second "Final Pricing" row`);
    }

    const name = String(row[0]);
    const nameKey = normalizeName(name);
    const previous = seen.get(nameKey);
    if (previous !== undefined) {
      fail(`row ${rowNumber}: duplicate item "${name}" (already seen at row ${previous})`);
    }
    seen.set(nameKey, rowNumber);

    items.push({
      name,
      nameKey,
      importKey: nameKey,
      protein: num(row[1]),
      referencePrice: num(row[2]),
      isVeg: blockIndex === 0,
      sortOrder: items.length,
      rowNumber,
    });
  }

  if (finals.length !== 2) {
    fail(`expected 2 "Final Pricing" rows (veg then non-veg), found ${finals.length}`);
  }

  return { items, vegPrice: finals[0], nonVegPrice: finals[1] };
}
