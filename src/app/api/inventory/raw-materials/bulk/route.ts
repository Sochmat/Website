import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  RAW_MATERIALS_COLLECTION,
  isValidId,
  listBrands,
  listCategories,
  recalcDerivedCosts,
} from "@/lib/inventoryDb";
import { sanitizeRawMaterial } from "@/lib/rawMaterials";

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
 * Commit an import plan.
 *
 * Everything is re-validated here rather than trusting the preview response —
 * the plan travelled through the browser, so treating it as authoritative
 * would let a crafted request write arbitrary fields or an unknown category.
 * The whole batch goes through a single ordered:false bulkWrite.
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

    const [categories, brands] = await Promise.all([
      listCategories(),
      listBrands(),
    ]);
    const validIds = new Set(categories.map((c) => String(c._id)));
    const validBrandIds = new Set(brands.map((b) => String(b._id)));

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];
    const rejected: string[] = [];
    // A name may appear once per batch; two ops on one nameKey would make the
    // final state depend on write order.
    const seen = new Set<string>();

    for (const raw of creates) {
      const { doc, error } = sanitizeRawMaterial(
        raw as Record<string, unknown>,
        validIds,
        validBrandIds,
      );
      if (error || !doc) {
        rejected.push(`${describe(raw)}: ${error ?? "invalid"}`);
        continue;
      }
      if (seen.has(doc.nameKey)) {
        rejected.push(`${doc.name}: duplicate in this batch`);
        continue;
      }
      seen.add(doc.nameKey);
      // Upsert on nameKey: if the row was created by someone else between the
      // preview and this commit, update it instead of failing on a duplicate.
      ops.push({
        updateOne: {
          filter: { nameKey: doc.nameKey },
          update: { $set: { ...doc, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      });
    }

    for (const raw of updates) {
      const id = String((raw as { _id?: unknown })?._id ?? "");
      if (!isValidId(id)) {
        rejected.push(`${describe(raw)}: invalid id`);
        continue;
      }
      const { doc, error } = sanitizeRawMaterial(
        raw as Record<string, unknown>,
        validIds,
        validBrandIds,
      );
      if (error || !doc) {
        rejected.push(`${describe(raw)}: ${error ?? "invalid"}`);
        continue;
      }
      if (seen.has(doc.nameKey)) {
        rejected.push(`${doc.name}: duplicate in this batch`);
        continue;
      }
      seen.add(doc.nameKey);
      ops.push({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { ...doc, updatedAt: now } },
        },
      });
    }

    if (ops.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .bulkWrite(ops, { ordered: false });

    // An import can move many prices at once; recalculate everything derived
    // rather than working out which ids were touched.
    const repriced = await recalcDerivedCosts();

    return NextResponse.json({
      success: true,
      created: result.upsertedCount,
      updated: result.modifiedCount,
      repricedProductionItems: repriced.productionItems,
      repricedItemRecipes: repriced.itemRecipes,
      // Rows that passed the preview but failed re-validation. Non-empty here
      // means the client and server disagreed — worth surfacing, not hiding.
      rejected,
    });
  } catch (error) {
    console.error("Error committing raw material import:", error);
    return NextResponse.json(
      { success: false, message: "Failed to import raw materials" },
      { status: 500 },
    );
  }
}

/** Best-effort label for an unvalidated row, for the rejection list. */
function describe(raw: unknown): string {
  const name = String((raw as { name?: unknown })?.name ?? "").trim();
  return name || "(unnamed row)";
}
