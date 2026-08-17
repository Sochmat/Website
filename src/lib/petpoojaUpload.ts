// Petpooja item lists — what was sold on the POS, uploaded as a sheet.
//
// Orders placed on the website arrive one at a time and carry their own items.
// Petpooja is the other counter: it keeps its own record, and what it sold
// reaches us as a spreadsheet of item names and quantities. Each upload is
// kept whole, as one dated entry, rather than merged into a running total —
// so an upload can always be read back exactly as it was given.
//
// Pure logic — no ExcelJS, no Mongo. See petpoojaUpload.test.ts.

import { istInstant, istToday, toIstDate } from "./ist";
import { recipeLookupKey } from "./menuRecipes";
import { normalizeMaterialName } from "./rawMaterials";

/** Sheet headers, in order. Both are required. */
export const PETPOOJA_SHEET_COLUMNS = ["Item Name", "Qty"] as const;

/**
 * The optional size column.
 *
 * Deliberately outside PETPOOJA_SHEET_COLUMNS: a sheet is read against those
 * headers and would fail on a missing one, whereas a variant is something only
 * some items have. Bulk Orders Update fills it in; an uploaded sheet leaves it
 * blank, and a blank variant means the item's base recipe, exactly as before.
 */
export const PETPOOJA_VARIANT_COLUMN = "Variant";

/** One document per entry, uploaded or typed in. */
export const PETPOOJA_UPLOADS_COLLECTION = "petpoojaUploads";

/**
 * The instant an entry belongs at, from the IST calendar date it covers.
 *
 * Bulk Orders Update is often typed up after the fact — yesterday's Petpooja
 * figures entered this morning — so the admin says which day the sales were,
 * and that day is what the entry is dated and what its consumption is filed
 * under. Everything downstream reads instants, so a `yyyy-mm-dd` becomes one
 * here rather than in three separate places.
 *
 * A past day lands at 23:59 IST: a day's Petpooja sales are a whole-day total,
 * so they belong AFTER that day's other movements in the consumption report,
 * not before them. Today is simply `now` — stamping this evening for sales
 * still being made would put the entry in the future, and picking today should
 * behave exactly as it did before a date could be picked at all.
 *
 * Returns null on anything that is not a real, non-future IST date. Petpooja
 * has already served the food by the time it is entered, so a future day is
 * not a sale that happened.
 */
export function saleDateInstant(date: string, now: Date): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const today = istToday(now);
  // Both sides are IST calendar dates, where lexicographic order IS
  // chronological order — no instant comparison, so no timezone to get wrong.
  if (date > today) return null;
  if (date === today) return now;

  const at = istInstant(date, 23, 59);
  // Date.UTC rolls an impossible day over ("2026-02-31" → 3 Mar) rather than
  // refusing it, so the round trip is what actually rejects one.
  return toIstDate(at) === date ? at : null;
}

/**
 * How an entry was recorded.
 *
 * "upload" — a sheet dropped on the Petpooja tab.
 * "manual" — items picked and quantities typed in Bulk Orders Update.
 *
 * Both mean the same thing (these items sold, this many times) and spend stock
 * identically; the source is kept only so the table can say where it came from.
 * Entries written before manual entry existed carry no source and are uploads.
 */
export type PetpoojaEntrySource = "upload" | "manual";

/** One row as it came off the sheet, header-keyed. */
export type PetpoojaSheetRow = Record<string, unknown>;

/** An item and how many of it were sold. */
export interface PetpoojaItem {
  name: string;
  /** normalizeMaterialName(name) — the key everything else matches on. */
  nameKey: string;
  /**
   * The size sold, when the item has variants. Absent means the item was sold
   * without one, and deducts its base recipe — which is every entry recorded
   * before this column existed.
   */
  variantName?: string;
  /** normalizeMaterialName(variantName); absent alongside it. */
  variantKey?: string;
  qty: number;
}

/** A row that could not be used, and why. */
export interface PetpoojaRowError {
  /** 1-indexed worksheet row, so the user can go straight to it. */
  rowNumber: number;
  name: string;
  reason: string;
}

export interface ParsedPetpoojaUpload {
  items: PetpoojaItem[];
  errors: PetpoojaRowError[];
  /** Data rows read, before merging duplicates or dropping bad ones. */
  rowsRead: number;
}

/** Accepts "1,000" and " 12.5 "; rejects "" and "abc". */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Kill float noise (0.30000000000000004) without truncating real decimals. */
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Turn sheet rows into the item list an upload records.
 *
 * The same item listed twice is SUMMED, not rejected: a POS export routinely
 * repeats an item across the day, and two lines for it are two sales, not a
 * contradiction. Matching uses the same normalized name as everything else in
 * the inventory console, so "Dal Rice", "dal  rice" and "Dal Rice." are one
 * item — recorded under the first spelling seen.
 *
 * Two SIZES of one item are two lines, not one: a Small and a Large draw down
 * different amounts, so they are summed apart, keyed the way a recipe is found.
 *
 * Bad rows are collected rather than thrown: one blank quantity in a hundred
 * rows should not cost the user the whole upload. The caller decides what to
 * do with them.
 */
export function parsePetpoojaRows(
  rows: PetpoojaSheetRow[],
  rowNumberOf: (row: PetpoojaSheetRow, index: number) => number,
): ParsedPetpoojaUpload {
  const byKey = new Map<string, PetpoojaItem>();
  const errors: PetpoojaRowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = rowNumberOf(row, index);
    const name = String(row["Item Name"] ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (!name) {
      errors.push({ rowNumber, name: "", reason: "Item name is required" });
      return;
    }

    const qty = toNumber(row["Qty"]);
    if (qty === null) {
      errors.push({ rowNumber, name, reason: "Qty must be a number" });
      return;
    }
    // Zero is a valid stock level but not a valid sale — a row saying nothing
    // was sold carries no information worth recording.
    if (qty <= 0) {
      errors.push({ rowNumber, name, reason: "Qty must be greater than 0" });
      return;
    }

    const nameKey = normalizeMaterialName(name);
    const variantName = String(row[PETPOOJA_VARIANT_COLUMN] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const variantKey = variantName ? normalizeMaterialName(variantName) : "";

    const key = recipeLookupKey(nameKey, variantKey);
    const existing = byKey.get(key);
    if (existing) existing.qty = roundQty(existing.qty + qty);
    else {
      byKey.set(key, {
        name,
        nameKey,
        // Left off entirely when there is no size, so an item sold without one
        // stores exactly what it always did.
        ...(variantKey ? { variantName, variantKey } : {}),
        qty: roundQty(qty),
      });
    }
  });

  return { items: [...byKey.values()], errors, rowsRead: rows.length };
}

/** An upload without its items — what the list view needs. */
export interface PetpoojaUploadSummary {
  _id: string;
  /**
   * ISO instant — the day these sales HAPPENED, which is what the list sorts
   * by and what the consumption report files the deduction under. Equal to
   * `recordedAt` unless a Bulk Orders Update backdated it.
   */
  uploadedAt: string;
  /**
   * ISO instant the entry was actually saved. Kept for the audit trail: once
   * `uploadedAt` can be backdated, "when did this land" is a separate question
   * from "which day is it for". Absent on entries written before backdating.
   */
  recordedAt?: string;
  /** The session role that recorded it; the console has no per-user identity. */
  uploadedByRole: string;
  source: PetpoojaEntrySource;
  /** The uploaded file's name; blank on a manual entry. */
  fileName: string;
  /** Distinct items, after duplicates were summed. */
  totalItems: number;
  totalQty: number;
  /** Rows the parser refused; 0 on a clean file. */
  skippedRows: number;
  /** Stock rows this upload deducted, across both kinds. */
  stockRows: number;
  /** Deducted rows the shelf could not cover in full. */
  shortfallRows: number;
  /** Uploaded items with no item recipe — nothing was deducted for these. */
  unmapped: string[];
  /** Set when the deduction failed; the item list was still recorded. */
  consumptionError?: string;
}

/**
 * A stock row this upload moved, as the details view shows it.
 *
 * A projection of stockAudits' AuditLine, which is what the deduction actually
 * writes — only the fields worth reading back are carried across the wire.
 */
export interface PetpoojaStockLine {
  id: string;
  name: string;
  unit: string;
  /** null = nothing was on record; the whole draw-down is a shortfall. */
  previousStock: number | null;
  closingStock: number;
  consumedQty: number;
  /** How much of consumedQty the shelf could not cover. 0 when it was fine. */
  shortfall: number;
}

/** An upload with everything it recorded — what the details view shows. */
export interface PetpoojaUploadDetail extends PetpoojaUploadSummary {
  items: PetpoojaItem[];
  errors: PetpoojaRowError[];
  productionLines: PetpoojaStockLine[];
  rawLines: PetpoojaStockLine[];
}

/** Total quantity across an upload, for the list view's headline figure. */
export function totalQty(items: PetpoojaItem[]): number {
  return roundQty(items.reduce((sum, item) => sum + item.qty, 0));
}
