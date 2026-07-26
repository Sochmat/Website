import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  costingMaterialsById,
  isValidId,
  recalcItemRecipeCosts,
} from "@/lib/inventoryDb";
import {
  sanitizeProductionItem,
  type ProductionItemInput,
} from "@/lib/productionItems";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const dynamic = "force-dynamic";

// Matches the importer's practical ceiling; keeps one request from writing an
// unbounded number of documents.
const MAX_ROWS = 5000;

interface CommitBody {
  creates?: unknown[];
  updates?: unknown[];
}

/**
 * Commit a production-item import plan.
 *
 * Everything is re-validated here rather than trusting the preview response —
 * the plan travelled through the browser, so treating it as authoritative would
 * let a crafted request write an arbitrary price or an unknown raw material.
 * Prices are recomputed from live raw-material costs by sanitizeProductionItem,
 * so any `pricePerPurchaseUnit` in the payload is ignored.
 *
 * `currentStock` is never in the sanitized doc, so a $set here leaves stock on
 * hand exactly as the Adjustment page left it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CommitBody;
    const creates = Array.isArray(body.creates) ? body.creates : [];
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (creates.length + updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "Nothing to import" },
        { status: 400 },
      );
    }
    if (creates.length + updates.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `Too many rows (limit ${MAX_ROWS})` },
        { status: 413 },
      );
    }

    const materialsById = await costingMaterialsById();

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];
    const rejected: string[] = [];
    // A name may appear once per batch; two ops on one nameKey would make the
    // final state depend on write order.
    const seen = new Set<string>();

    const build = (raw: unknown, id?: string) => {
      const { doc, error } = sanitizeProductionItem(
        raw as ProductionItemInput,
        materialsById,
        normalizeMaterialName,
      );
      if (error || !doc) {
        rejected.push(`${describe(raw)}: ${error ?? "invalid"}`);
        return;
      }
      if (seen.has(doc.nameKey)) {
        rejected.push(`${doc.name}: duplicate in this batch`);
        return;
      }
      seen.add(doc.nameKey);

      if (id) {
        ops.push({
          updateOne: {
            filter: { _id: new ObjectId(id) },
            update: { $set: { ...doc, updatedAt: now } },
          },
        });
        return;
      }
      // Upsert on nameKey: if the item was created by someone else between the
      // preview and this commit, update it instead of failing on a duplicate.
      ops.push({
        updateOne: {
          filter: { nameKey: doc.nameKey },
          update: {
            $set: { ...doc, updatedAt: now },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      });
    };

    for (const raw of creates) build(raw);

    for (const raw of updates) {
      const id = String((raw as { _id?: unknown })?._id ?? "");
      if (!isValidId(id)) {
        rejected.push(`${describe(raw)}: invalid id`);
        continue;
      }
      build(raw, id);
    }

    if (ops.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(PRODUCTION_ITEMS_COLLECTION)
      .bulkWrite(ops, { ordered: false });

    // Production prices feed item-recipe costs, so an import here can move
    // numbers a level up. Recompute rather than working out which ids moved.
    const repricedItemRecipes = await recalcItemRecipeCosts();

    return NextResponse.json({
      success: true,
      created: result.upsertedCount,
      updated: result.modifiedCount,
      repricedItemRecipes,
      // Rows that passed the preview but failed re-validation. Non-empty here
      // means the client and server disagreed — worth surfacing, not hiding.
      rejected,
    });
  } catch (error) {
    console.error("Error committing production item import:", error);
    return NextResponse.json(
      { success: false, message: "Failed to import production items" },
      { status: 500 },
    );
  }
}

/** Best-effort label for an unvalidated row, for the rejection list. */
function describe(raw: unknown): string {
  const name = String((raw as { name?: unknown })?.name ?? "").trim();
  return name || "(unnamed row)";
}
