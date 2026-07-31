import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  WASTAGES_COLLECTION,
  isValidId,
} from "@/lib/inventoryDb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { pricePerConsumptionUnit } from "@/lib/rawMaterials";
import {
  buildWastage,
  parseWastageQty,
  type WastageEntry,
  type WastageKind,
} from "@/lib/wastage";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

const COLLECTION: Record<WastageKind, string> = {
  raw: RAW_MATERIALS_COLLECTION,
  production: PRODUCTION_ITEMS_COLLECTION,
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function toKind(value: unknown): WastageKind | null {
  return value === "raw" || value === "production" ? value : null;
}

function toEntry(d: Record<string, unknown>): WastageEntry {
  return {
    _id: String(d._id),
    kind: toKind(d.kind) ?? "raw",
    refId: String(d.refId ?? ""),
    name: String(d.name ?? ""),
    unit: String(d.unit ?? ""),
    qty: Number(d.qty ?? 0),
    // A record written for an unpriced item has no figure at all, which reads
    // as "not valued" rather than "worth nothing".
    unitCost: typeof d.unitCost === "number" ? d.unitCost : null,
    cost: typeof d.cost === "number" ? d.cost : null,
    previousStock:
      typeof d.previousStock === "number" ? d.previousStock : null,
    closingStock: Number(d.closingStock ?? 0),
    shortfall: Number(d.shortfall ?? 0),
    recordedAt: new Date(d.recordedAt as string | number | Date).toISOString(),
    recordedByRole: String(d.recordedByRole ?? "admin"),
  };
}

/**
 * Every wastage recorded, newest first.
 *
 * Flat rather than grouped: a wastage is one item and one quantity, so there
 * is nothing to fold into a save. `kind` narrows to one collection when the
 * caller wants only spoiled raw material or only spoiled production stock.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const kind = toKind(params.get("kind"));

    const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { db } = await connectToDatabase();
    const docs = await db
      .collection(WASTAGES_COLLECTION)
      .find(kind ? { kind } : {})
      .sort({ recordedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(
      { success: true, wastages: docs.map(toEntry) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching wastages:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch wastages" },
      { status: 500 },
    );
  }
}

/**
 * Record one wastage and take it off the shelf.
 *
 * The deduction is computed here from the stored quantity rather than taking a
 * client-computed closing figure: a page that loaded an hour ago must not
 * write back a stale base, and two people recording spoilage at once must both
 * land.
 *
 * Written with a computed $set rather than $inc because the quantity is
 * floored at zero — same trade-off as drawDownStock, and for the same reason:
 * the shelf cannot hold a negative quantity. The uncovered part is kept on the
 * record as `shortfall` instead of being lost.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const kind = toKind(body?.kind);
    if (!kind) {
      return NextResponse.json(
        { success: false, message: "Unknown kind" },
        { status: 400 },
      );
    }

    const id = String(body?.id ?? "");
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, message: "Select an item" },
        { status: 400 },
      );
    }

    const { value: qty, error } = parseWastageQty(body?.qty);
    if (error || qty === undefined) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid quantity" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION[kind]);

    const doc = await collection.findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          name: 1,
          consumptionUnit: 1,
          currentStock: 1,
          // Priced here, at record time — see WastageEntry.unitCost.
          pricePerPurchaseUnit: 1,
          unitConversion: 1,
        },
      },
    );
    // Deleted since the page loaded — rejected rather than resurrected.
    if (!doc) {
      return NextResponse.json(
        { success: false, message: "That item no longer exists" },
        { status: 404 },
      );
    }

    const movement = buildWastage({
      qty,
      previousStock:
        typeof doc.currentStock === "number" ? doc.currentStock : null,
      unitCost: pricePerConsumptionUnit({
        pricePerPurchaseUnit: Number(doc.pricePerPurchaseUnit ?? 0),
        unitConversion: Number(doc.unitConversion ?? 0),
      }),
    });

    const now = new Date();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { currentStock: movement.closingStock, updatedAt: now } },
    );

    const session = await verifySession(
      request.cookies.get(ADMIN_COOKIE)?.value,
    );
    // Written after the stock, so a failed deduction is never recorded as
    // history — the reverse would claim stock left the shelf when it did not.
    const record = {
      kind,
      refId: id,
      name: String(doc.name ?? ""),
      unit: String(doc.consumptionUnit ?? ""),
      qty: movement.qty,
      unitCost: movement.unitCost,
      cost: movement.cost,
      previousStock:
        typeof doc.currentStock === "number" ? doc.currentStock : null,
      closingStock: movement.closingStock,
      shortfall: movement.shortfall,
      recordedAt: now,
      recordedByRole: session?.role ?? "admin",
    };
    const inserted = await db
      .collection(WASTAGES_COLLECTION)
      .insertOne({ ...record });

    return NextResponse.json({
      success: true,
      wastage: toEntry({ ...record, _id: inserted.insertedId }),
      // The resulting quantity, so the screen can settle without a refetch.
      updated: { id, kind, currentStock: movement.closingStock },
    });
  } catch (error) {
    console.error("Error recording wastage:", error);
    return NextResponse.json(
      { success: false, message: "Failed to record wastage" },
      { status: 500 },
    );
  }
}
