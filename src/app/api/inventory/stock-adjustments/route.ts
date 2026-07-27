import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  STOCK_AUDITS_COLLECTION,
  isValidId,
} from "@/lib/inventoryDb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { pricePerConsumptionUnit } from "@/lib/rawMaterials";
import { parseStockQty } from "@/lib/stockAdjustment";
import {
  buildAuditLine,
  summarizeAuditLines,
  type AuditKind,
  type AuditLine,
} from "@/lib/stockAudits";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

// Well above any realistic stock-take; a backstop against a runaway payload.
const MAX_UPDATES = 2000;

const COLLECTION: Record<AuditKind, string> = {
  raw: RAW_MATERIALS_COLLECTION,
  production: PRODUCTION_ITEMS_COLLECTION,
};

interface UpdateInput {
  id?: unknown;
  currentStock?: unknown;
}

/**
 * Commit one Audit-screen save.
 *
 * A save covers exactly one kind — raw materials and production items are
 * counted and committed separately, so each gets its own history. The kind
 * comes in at the top level; a mixed payload is a client bug, not a supported
 * shape.
 *
 * Every row is re-validated here — the payload came from the browser, so it is
 * not trusted. Invalid rows are reported back rather than silently dropped,
 * and the valid ones still go through.
 *
 * The quantity each row *replaces* is read from the database rather than taken
 * from the request: the audit trail has to record what was actually on record,
 * not what the client believed was on record.
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
        { success: false, message: "Nothing to save" },
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
    const accepted: { id: string; value: number }[] = [];
    // One row per item; two counts for the same id would make the winner
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

      const { value, error } = parseStockQty(update?.currentStock);
      if (error || value === undefined) {
        rejected.push(`${id}: ${error ?? "invalid quantity"}`);
        continue;
      }

      accepted.push({ id, value });
    }

    if (accepted.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION[kind]);

    // What is on record right now, for the audit line's "before" side. Also
    // tells us which ids still exist — a row deleted since the page loaded is
    // rejected instead of being written back as an upsert-shaped no-op.
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
          },
        },
      )
      .toArray();
    const byId = new Map(existing.map((doc) => [String(doc._id), doc]));

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];
    const lines: AuditLine[] = [];

    for (const row of accepted) {
      const doc = byId.get(row.id);
      if (!doc) {
        rejected.push(`${row.id}: no longer exists`);
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: new ObjectId(row.id) },
          update: { $set: { currentStock: row.value, updatedAt: now } },
        },
      });

      lines.push(
        buildAuditLine({
          id: row.id,
          name: String(doc.name ?? ""),
          unit: String(doc.consumptionUnit ?? ""),
          previousStock:
            typeof doc.currentStock === "number" ? doc.currentStock : null,
          closingStock: row.value,
          unitCost: pricePerConsumptionUnit({
            pricePerPurchaseUnit: Number(doc.pricePerPurchaseUnit ?? 0),
            unitConversion: Number(doc.unitConversion ?? 0),
          }),
        }),
      );
    }

    if (ops.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const result = await collection.bulkWrite(ops, { ordered: false });

    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    // Written after the stock, so a failed write is never recorded as history.
    // If this insert is the thing that fails, the catch below reports it and
    // the quantities still stand — the safer way round of the two.
    const audit = await db.collection(STOCK_AUDITS_COLLECTION).insertOne({
      kind,
      type: "audit",
      savedAt: now,
      savedByRole: session?.role ?? "admin",
      ...summarizeAuditLines(lines),
      lines,
    });

    return NextResponse.json({
      success: true,
      // Rows whose value was already what we wrote count as saved, not failed —
      // report what was accepted, not just what Mongo had to change.
      saved: ops.length,
      modified: result.modifiedCount,
      rejected,
      auditId: String(audit.insertedId),
    });
  } catch (error) {
    console.error("Error saving stock adjustments:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save stock quantities" },
      { status: 500 },
    );
  }
}
