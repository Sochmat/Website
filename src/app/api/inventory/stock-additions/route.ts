import { NextRequest, NextResponse } from "next/server";
import {
  ObjectId,
  type AnyBulkWriteOperation,
  type Document,
} from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  STOCK_AUDITS_COLLECTION,
  drawDownStock,
  isValidId,
} from "@/lib/inventoryDb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { pricePerConsumptionUnit } from "@/lib/rawMaterials";
import { parseStockQty } from "@/lib/stockAdjustment";
import {
  buildAdditionLine,
  summarizeAuditLines,
  type AuditKind,
  type AuditLine,
} from "@/lib/stockAudits";
import { recipeConsumption, toRecipeLines } from "@/lib/productionItems";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

// Well above any realistic delivery; a backstop against a runaway payload.
const MAX_UPDATES = 2000;

const COLLECTION: Record<AuditKind, string> = {
  raw: RAW_MATERIALS_COLLECTION,
  production: PRODUCTION_ITEMS_COLLECTION,
};

interface UpdateInput {
  id?: unknown;
  addQty?: unknown;
}

/**
 * Add received stock to what is already on record.
 *
 * The sibling of /stock-adjustments: that one REPLACES a quantity with a
 * counted figure, this one ADDS to it. Both cover one kind per save and both
 * write a history record, so the Audit and Add Stock screens each keep their
 * own trail.
 *
 * The sum is computed here from the stored quantity rather than taking a
 * client-computed total: two people receiving deliveries at once must both
 * land, and a page that loaded an hour ago must not write back a stale base.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const kind: AuditKind | null =
      body?.kind === "raw" || body?.kind === "production" ? body.kind : null;
    if (!kind) {
      return NextResponse.json(
        { success: false, message: "Unknown kind" },
        { status: 400 },
      );
    }

    const updates: UpdateInput[] = Array.isArray(body?.updates)
      ? body.updates
      : [];

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "Nothing to add" },
        { status: 400 },
      );
    }
    if (updates.length > MAX_UPDATES) {
      return NextResponse.json(
        { success: false, message: `Too many rows (limit ${MAX_UPDATES})` },
        { status: 413 },
      );
    }

    const rejected: string[] = [];
    const accepted: { id: string; addQty: number }[] = [];
    // One row per item; two additions for the same id would make the winner
    // depend on write order.
    const seen = new Set<string>();

    for (const update of updates) {
      const id = String(update?.id ?? "");
      if (!isValidId(id)) {
        rejected.push(`${id || "(no id)"}: invalid id`);
        continue;
      }
      if (seen.has(id)) {
        rejected.push(`${id}: listed twice`);
        continue;
      }
      seen.add(id);

      const { value, error } = parseStockQty(update?.addQty);
      if (error || value === undefined) {
        rejected.push(`${id}: ${error ?? "invalid quantity"}`);
        continue;
      }
      // Zero is a valid stock level but not a valid delivery — it would write
      // a history row saying nothing happened.
      if (value === 0) {
        rejected.push(`${id}: quantity to add must be more than 0`);
        continue;
      }

      accepted.push({ id, addQty: value });
    }

    if (accepted.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION[kind]);

    // What is on record right now, for the history line's "before" side. Also
    // tells us which ids still exist — a row deleted since the page loaded is
    // rejected rather than resurrected by an $inc upsert.
    const existing = await collection
      .find(
        { _id: { $in: accepted.map((row) => new ObjectId(row.id)) } },
        {
          projection: {
            name: 1,
            consumptionUnit: 1,
            currentStock: 1,
            // Priced here, at save time — see AuditLine.unitCost.
            pricePerPurchaseUnit: 1,
            unitConversion: 1,
            // Production items only: what making this spends. Ignored for raw
            // materials, which have no recipe.
            recipe: 1,
            batchYieldQty: 1,
          },
        },
      )
      .toArray();
    const byId = new Map(existing.map((doc) => [String(doc._id), doc]));

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];
    const lines: AuditLine[] = [];
    // What the recipes of everything produced in this save owe, summed across
    // rows so two items sharing a component draw down once. Kept per kind: a
    // recipe may be built on another production item, and that comes off the
    // production shelf, not the raw-material one.
    const owed: Record<AuditKind, Map<string, number>> = {
      raw: new Map(),
      production: new Map(),
    };

    for (const row of accepted) {
      const doc = byId.get(row.id);
      if (!doc) {
        rejected.push(`${row.id}: no longer exists`);
        continue;
      }

      const previousStock =
        typeof doc.currentStock === "number" ? doc.currentStock : null;
      const line = buildAdditionLine({
        id: row.id,
        name: String(doc.name ?? ""),
        unit: String(doc.consumptionUnit ?? ""),
        previousStock,
        addedQty: row.addQty,
        unitCost: pricePerConsumptionUnit({
          pricePerPurchaseUnit: Number(doc.pricePerPurchaseUnit ?? 0),
          unitConversion: Number(doc.unitConversion ?? 0),
        }),
      });

      ops.push({
        updateOne: {
          filter: { _id: new ObjectId(row.id) },
          // $inc, not a computed $set: it settles on the server, so a
          // concurrent delivery adds to this one instead of overwriting it.
          // An absent currentStock starts the field at the added amount, which
          // is what "receiving stock for something untracked" means.
          update: { $inc: { currentStock: line.addedQty as number }, $set: { updatedAt: now } },
        },
      });

      lines.push(line);

      // Producing stock spends what it is made from. Scaled from the recipe as
      // stored — an item with no recipe or no batch yield simply spends
      // nothing, which is the honest answer when we cannot know.
      if (kind === "production") {
        for (const consumed of recipeConsumption(
          toRecipeLines(doc.recipe),
          Number(doc.batchYieldQty ?? 0),
          row.addQty,
        )) {
          const bucket = owed[consumed.refType];
          bucket.set(
            consumed.refId,
            (bucket.get(consumed.refId) ?? 0) + consumed.qty,
          );
        }
      }
    }

    if (ops.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const result = await collection.bulkWrite(ops, { ordered: false });

    // Spend the ingredients. Done after the production write, so a failure
    // here leaves stock added but not deducted — recoverable by hand, unlike
    // the reverse, which would take stock away for something never recorded.
    //
    // Nested production items are drawn down FIRST, and deliberately after the
    // $inc above: producing a base and then the item built on it, in one save,
    // must spend the base that was just made rather than the quantity from
    // before it existed.
    const consumedProduction = await drawDownStock(
      db,
      PRODUCTION_ITEMS_COLLECTION,
      owed.production,
      now,
    );
    const consumedRaw = await drawDownStock(
      db,
      RAW_MATERIALS_COLLECTION,
      owed.raw,
      now,
    );
    const consumedLines = [...consumedProduction, ...consumedRaw];

    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    // Written after the stock, so a failed write is never recorded as history.
    const audit = await db.collection(STOCK_AUDITS_COLLECTION).insertOne({
      kind,
      type: "addition",
      savedAt: now,
      savedByRole: session?.role ?? "admin",
      ...summarizeAuditLines(lines),
      consumedRows: consumedLines.length,
      lines,
      ...(consumedLines.length > 0 ? { consumedLines } : {}),
    });

    return NextResponse.json({
      success: true,
      saved: ops.length,
      modified: result.modifiedCount,
      rejected,
      auditId: String(audit.insertedId),
      // The resulting quantities, so the screen can settle without a refetch.
      // These are what we computed from the read above; a concurrent addition
      // that landed in between makes the stored value higher, not wrong.
      updated: lines.map((line) => ({
        id: line.id,
        currentStock: line.closingStock,
      })),
      // Stock spent on those additions, so both tabs settle to the same
      // numbers without a refetch. Tagged with which shelf each row came off,
      // since a production recipe can now spend either.
      consumed: [
        ...consumedProduction.map((line) => ({ ...line, kind: "production" as const })),
        ...consumedRaw.map((line) => ({ ...line, kind: "raw" as const })),
      ].map((line) => ({
        id: line.id,
        kind: line.kind,
        name: line.name,
        unit: line.unit,
        consumedQty: line.consumedQty,
        shortfall: line.shortfall,
        currentStock: line.closingStock,
      })),
    });
  } catch (error) {
    console.error("Error saving stock additions:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add stock" },
      { status: 500 },
    );
  }
}
