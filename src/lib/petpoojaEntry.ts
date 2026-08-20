// Recording one Petpooja entry, whichever way it arrived.
//
// Two doors lead here: a sheet uploaded on the Petpooja tab, and a Bulk Orders
// Update typed into the modal. Both mean the same thing — these items were
// sold, this many times — so both land as the same kind of entry and spend
// stock the same way. Only `source` and how the items were gathered differ.

import type { Db } from "mongodb";
import {
  PETPOOJA_UPLOADS_COLLECTION,
  totalQty,
  type PetpoojaEntrySource,
  type PetpoojaItem,
  type PetpoojaRowError,
} from "@/lib/petpoojaUpload";
import {
  consumeStockForPetpoojaItems,
  type PetpoojaConsumption,
} from "@/lib/petpoojaStock";

export interface RecordEntryInput {
  source: PetpoojaEntrySource;
  items: PetpoojaItem[];
  /** The uploaded file's name; absent for a manual entry. */
  fileName?: string;
  /** Rows the sheet parser refused. Manual entries reject instead of skipping. */
  errors?: PetpoojaRowError[];
  /** Rows read before merging duplicates; defaults to the item count. */
  rowsRead?: number;
  /**
   * The instant these sales HAPPENED, when it is not now — a Bulk Orders
   * Update entered for an earlier day. Defaults to the moment of saving, which
   * is what a sheet upload and a same-day entry both mean.
   */
  entryAt?: Date;
  /** The session role recording this; the console has no per-user identity. */
  role: string;
}

export interface RecordEntryResult {
  entryId: string;
  totalItems: number;
  totalQty: number;
  skippedRows: number;
  stockRows: number;
  shortfallRows: number;
  unmapped: string[];
  /** Set when the deduction failed; the item list was still recorded. */
  consumptionError?: string;
}

/**
 * Save the entry, then spend what it sold.
 *
 * The entry lands BEFORE any stock moves, so a deduction that fails still
 * leaves the item list recorded — losing what was sold is the worse half to
 * lose, and the entry is what makes the failure findable afterwards.
 *
 * Never throws on a deduction failure: the list is real either way, and the
 * caller reports the failure rather than pretending nothing was recorded.
 *
 * An entry may be dated to an earlier day than the one it is saved on, so two
 * timestamps are kept. `uploadedAt` is the day the sales happened — what the
 * list sorts by and what the consumption report files this under. `recordedAt`
 * is when it was actually typed, which only the audit trail cares about. They
 * are the same instant unless the admin picked an earlier date.
 */
export async function recordPetpoojaEntry(
  db: Db,
  input: RecordEntryInput,
): Promise<RecordEntryResult> {
  const { source, items, errors = [], role } = input;
  const recordedAt = new Date();
  const uploadedAt = input.entryAt ?? recordedAt;
  const collection = db.collection(PETPOOJA_UPLOADS_COLLECTION);

  const inserted = await collection.insertOne({
    uploadedAt,
    recordedAt,
    uploadedByRole: role,
    source,
    ...(input.fileName ? { fileName: input.fileName } : {}),
    totalItems: items.length,
    totalQty: totalQty(items),
    rowsRead: input.rowsRead ?? items.length,
    skippedRows: errors.length,
    items,
    ...(errors.length > 0 ? { errors } : {}),
  });

  // Petpooja has already served this food by the time we see it, so recording
  // it IS the moment the stock left. Each item is spent exactly as if it had
  // been ordered that many times — same recipes as a delivered website order.
  //
  // The deduction is filed under `uploadedAt` (the day sold) but happens at
  // `recordedAt`: backdating an entry moves where it READS in the consumption
  // report, and cannot rewind a shelf that has been counted since.
  let consumption: PetpoojaConsumption | undefined;
  let consumptionError: string | undefined;
  try {
    consumption = await consumeStockForPetpoojaItems(
      db,
      items,
      uploadedAt,
      recordedAt,
    );
    await collection.updateOne(
      { _id: inserted.insertedId },
      { $set: { consumption } },
    );
  } catch (err) {
    console.error(`Stock deduction failed for Petpooja ${source}:`, err);
    consumptionError =
      source === "upload"
        ? "Item list saved, but stock could not be deducted — re-upload this file to retry"
        : "Entry saved, but stock could not be deducted — save it again to retry";
    await collection.updateOne(
      { _id: inserted.insertedId },
      {
        $set: {
          consumptionError:
            err instanceof Error ? err.message : "Stock deduction failed",
        },
      },
    );
  }

  return {
    entryId: String(inserted.insertedId),
    totalItems: items.length,
    totalQty: totalQty(items),
    skippedRows: errors.length,
    stockRows: consumption?.rowCount ?? 0,
    shortfallRows: consumption?.shortfallRows ?? 0,
    unmapped: consumption?.unmapped ?? [],
    consumptionError,
  };
}
