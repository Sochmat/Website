import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  RAW_MATERIALS_COLLECTION,
  ensureBrands,
  ensureCategories,
  ensureUnits,
  isValidId,
  recalcDerivedCosts,
} from "@/lib/inventoryDb";
import { normalizeUnitName, sanitizeRawMaterial } from "@/lib/rawMaterials";

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
 * would let a crafted request write arbitrary fields. The whole batch goes
 * through a single ordered:false bulkWrite.
 *
 * Categories, brands and units the sheet introduced are created FIRST, and the
 * rows are then resolved against the refreshed lists. Names are what the rows
 * are resolved by, not the ids the preview issued: a new lookup had only a
 * placeholder id then, and resolving by name also means a category someone
 * else created in the meantime is reused rather than duplicated.
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

    const rows = [...creates, ...updates] as Record<string, unknown>[];
    const nameOf = (row: Record<string, unknown>, key: string) =>
      String(row?.[key] ?? "").trim();

    // Create whatever the sheet introduced, then resolve against the result.
    const [categories, brands, addedUnits] = await Promise.all([
      ensureCategories(rows.map((r) => nameOf(r, "categoryName"))),
      ensureBrands(rows.map((r) => nameOf(r, "brandName"))),
      ensureUnits([
        ...rows.map((r) => ({
          name: normalizeUnitName(nameOf(r, "consumptionUnit")),
          kind: "consumption" as const,
        })),
        ...rows.map((r) => ({
          name: normalizeUnitName(nameOf(r, "purchaseUnit")),
          kind: "purchase" as const,
        })),
      ]),
    ]);

    const categoryIds = categories.ids;
    const brandIds = brands.ids;
    const validIds = new Set(categoryIds.values());
    const validBrandIds = new Set(brandIds.values());

    /**
     * Point a row at the real ids. A row carrying a lookup NAME is resolved by
     * it; one carrying only an id (an older client, or a hand-made request) is
     * left as it is and re-validated against the valid sets as before.
     */
    const resolve = (raw: unknown): Record<string, unknown> => {
      const row = { ...(raw as Record<string, unknown>) };
      const categoryName = nameOf(row, "categoryName");
      if (categoryName) {
        row.categoryId = categoryIds.get(categoryName.toLowerCase()) ?? "";
      }
      const brandName = nameOf(row, "brandName");
      // A blank brand name means unbranded, which is a legitimate value — only
      // a non-blank one resolves to an id.
      if (brandName) {
        row.brandId = brandIds.get(brandName.toLowerCase()) ?? "";
      } else if ("brandName" in row) {
        row.brandId = "";
      }
      return row;
    };

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];
    const rejected: string[] = [];
    // A name may appear once per batch; two ops on one nameKey would make the
    // final state depend on write order.
    const seen = new Set<string>();

    for (const raw of creates) {
      const { doc, error } = sanitizeRawMaterial(
        resolve(raw),
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
        resolve(raw),
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
      // Lookups the sheet brought with it, so the screen can say what else
      // changed besides the materials themselves.
      addedCategories: categories.added,
      addedBrands: brands.added,
      addedUnits,
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
