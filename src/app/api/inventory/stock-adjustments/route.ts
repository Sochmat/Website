import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  isValidId,
} from "@/lib/inventoryDb";
import { parseStockQty } from "@/lib/stockAdjustment";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

// Well above any realistic stock-take; a backstop against a runaway payload.
const MAX_UPDATES = 2000;

type Kind = "raw" | "production";

const COLLECTION: Record<Kind, string> = {
  raw: RAW_MATERIALS_COLLECTION,
  production: PRODUCTION_ITEMS_COLLECTION,
};

interface UpdateInput {
  kind?: unknown;
  id?: unknown;
  currentStock?: unknown;
}

/**
 * Commit a batch of stock quantities.
 *
 * The adjustment screen collects edits locally and sends them in one go, so
 * this takes the whole set: raw materials and production items together, each
 * routed to its own collection and written with a single bulkWrite per
 * collection.
 *
 * Every row is re-validated here — the payload came from the browser, so it is
 * not trusted. Invalid rows are reported back rather than silently dropped,
 * and the valid ones still go through.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    const now = new Date();
    const ops: Record<Kind, AnyBulkWriteOperation<Document>[]> = {
      raw: [],
      production: [],
    };
    const rejected: string[] = [];
    // One row per item; two edits to the same id would make the winner depend
    // on write order.
    const seen = new Set<string>();

    for (const update of updates) {
      const kind = update?.kind === "production" ? "production" : "raw";
      if (update?.kind !== "raw" && update?.kind !== "production") {
        rejected.push(`${String(update?.id ?? "(no id)")}: unknown kind`);
        continue;
      }

      const id = String(update?.id ?? "");
      if (!isValidId(id)) {
        rejected.push(`${id || "(no id)"}: invalid id`);
        continue;
      }

      const key = `${kind}:${id}`;
      if (seen.has(key)) {
        rejected.push(`${id}: listed twice`);
        continue;
      }
      seen.add(key);

      const { value, error } = parseStockQty(update?.currentStock);
      if (error || value === undefined) {
        rejected.push(`${id}: ${error ?? "invalid quantity"}`);
        continue;
      }

      ops[kind].push({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { currentStock: value, updatedAt: now } },
        },
      });
    }

    if (ops.raw.length + ops.production.length === 0) {
      return NextResponse.json(
        { success: false, message: "Every row was rejected", rejected },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    let updated = 0;
    for (const kind of ["raw", "production"] as const) {
      if (ops[kind].length === 0) continue;
      const result = await db
        .collection(COLLECTION[kind])
        .bulkWrite(ops[kind], { ordered: false });
      updated += result.modifiedCount;
    }

    return NextResponse.json({
      success: true,
      // Rows whose value was already what we wrote count as saved, not failed —
      // report what was accepted, not just what Mongo had to change.
      saved: ops.raw.length + ops.production.length,
      modified: updated,
      rejected,
    });
  } catch (error) {
    console.error("Error saving stock adjustments:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save stock quantities" },
      { status: 500 },
    );
  }
}
