// Stock spent by an uploaded Petpooja item list.
//
// The counter-side twin of src/lib/orderStock.ts. A website order deducts when
// it is marked delivered; Petpooja has already served the food by the time we
// see the sheet, so the upload itself is the moment stock leaves. Each item is
// treated exactly as if it had been ordered `qty` times: same recipes, same
// draw-down, same flooring at zero.
//
// Runs once per upload. Uploading the same file twice deducts twice — that is
// two uploads, and the entries say so; nothing here silently de-duplicates a
// day's sales the admin genuinely meant to record.

import type { Db } from "mongodb";
import { componentDemand } from "@/lib/recipeDemand";
import {
  loadItemRecipesByNameKey,
  spendComponentDemand,
  type SpentStock,
} from "@/lib/stockSpend";
import type { PetpoojaItem } from "@/lib/petpoojaUpload";

/** What an upload took off the shelves, as stored on its entry. */
export interface PetpoojaConsumption {
  consumedAt: Date;
  productionLines: SpentStock["productionLines"];
  rawLines: SpentStock["rawLines"];
  rowCount: number;
  shortfallRows: number;
  netCost: number | null;
  /** Uploaded items with no item recipe — nothing was deducted for these. */
  unmapped: string[];
}

/**
 * Deduct everything an uploaded item list called for.
 *
 * An item with no recipe behind it is reported, not guessed at: Petpooja names
 * its dishes itself, and a name that matches nothing on our menu must be
 * visible rather than quietly costing nothing.
 *
 * Throws only on an unexpected Mongo failure. The caller decides what that
 * means for the upload — it should not throw the item list away, which is
 * still worth keeping whether or not the shelves could be updated.
 *
 * `consumedAt` is the day the sales are FILED under and may be backdated;
 * `stampedAt` is when the shelves are actually being touched. They are two
 * different facts, and the item's own `updatedAt` must not travel backwards
 * just because the entry it came from was for last Tuesday.
 */
export async function consumeStockForPetpoojaItems(
  db: Db,
  items: PetpoojaItem[],
  consumedAt: Date,
  stampedAt: Date = consumedAt,
): Promise<PetpoojaConsumption> {
  const recipes = await loadItemRecipesByNameKey(db);

  // An uploaded item is just something sold, `qty` times over — the same
  // input the delivered-order path builds from its order lines, size included.
  const { demand, unmapped } = componentDemand(
    items.map((item) => ({
      name: item.name,
      variantName: item.variantName,
      quantity: item.qty,
    })),
    recipes,
  );

  const spent = await spendComponentDemand(db, demand, stampedAt);

  return {
    consumedAt,
    productionLines: spent.productionLines,
    rawLines: spent.rawLines,
    rowCount: spent.rowCount,
    shortfallRows: spent.shortfallRows,
    netCost: spent.netCost,
    unmapped,
  };
}
