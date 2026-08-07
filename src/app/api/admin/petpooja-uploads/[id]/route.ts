import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PETPOOJA_UPLOADS_COLLECTION,
  totalQty,
  type PetpoojaItem,
  type PetpoojaRowError,
  type PetpoojaUploadDetail,
} from "@/lib/petpoojaUpload";
import {
  consumeStockForPetpoojaItems,
  reversePetpoojaConsumption,
  type PetpoojaConsumption,
} from "@/lib/petpoojaStock";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const dynamic = "force-dynamic";

/**
 * The stored draw-down rows, narrowed to what the details view reads.
 *
 * The deduction writes full AuditLines (costs and percentages included); only
 * the quantities are carried across the wire, so the modal cannot drift into
 * re-presenting a costing it does not explain.
 */
function stockLines(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(
    (l: {
      id?: unknown;
      name?: unknown;
      unit?: unknown;
      previousStock?: unknown;
      closingStock?: unknown;
      consumedQty?: unknown;
      shortfall?: unknown;
    }) => ({
      id: String(l?.id ?? ""),
      name: String(l?.name ?? ""),
      unit: String(l?.unit ?? ""),
      previousStock:
        typeof l?.previousStock === "number" ? l.previousStock : null,
      closingStock: Number(l?.closingStock ?? 0),
      consumedQty: Number(l?.consumedQty ?? 0),
      shortfall: Number(l?.shortfall ?? 0),
    }),
  );
}

/** One upload with its items — what "View details" opens. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid upload id is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const doc = await db
      .collection(PETPOOJA_UPLOADS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!doc) {
      return NextResponse.json(
        { success: false, message: "Upload not found" },
        { status: 404 },
      );
    }

    const items: PetpoojaItem[] = Array.isArray(doc.items)
      ? doc.items.map((i: { name?: unknown; nameKey?: unknown; qty?: unknown }) => ({
          name: String(i?.name ?? ""),
          nameKey: String(i?.nameKey ?? ""),
          qty: Number(i?.qty ?? 0),
        }))
      : [];

    const errors: PetpoojaRowError[] = Array.isArray(doc.errors)
      ? doc.errors.map(
          (e: { rowNumber?: unknown; name?: unknown; reason?: unknown }) => ({
            rowNumber: Number(e?.rowNumber ?? 0),
            name: String(e?.name ?? ""),
            reason: String(e?.reason ?? ""),
          }),
        )
      : [];

    const consumption = (doc.consumption ?? {}) as Record<string, unknown>;
    const productionLines = stockLines(consumption.productionLines);
    const rawLines = stockLines(consumption.rawLines);

    const upload: PetpoojaUploadDetail = {
      _id: String(doc._id),
      uploadedAt: new Date(doc.uploadedAt).toISOString(),
      uploadedByRole: String(doc.uploadedByRole ?? "admin"),
      // Entries predating manual entry carry no source; they were uploads.
      source: doc.source === "manual" ? "manual" : "upload",
      fileName: String(doc.fileName ?? ""),
      totalItems: Number(doc.totalItems ?? items.length),
      totalQty: Number(doc.totalQty ?? 0),
      skippedRows: Number(doc.skippedRows ?? errors.length),
      stockRows: Number(
        consumption.rowCount ?? productionLines.length + rawLines.length,
      ),
      shortfallRows: Number(consumption.shortfallRows ?? 0),
      unmapped: Array.isArray(consumption.unmapped)
        ? consumption.unmapped.map(String)
        : [],
      ...(doc.consumptionError
        ? { consumptionError: String(doc.consumptionError) }
        : {}),
      items,
      errors,
      productionLines,
      rawLines,
    };

    return NextResponse.json(
      { success: true, upload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching Petpooja upload:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch that upload" },
      { status: 500 },
    );
  }
}

/** The most items one entry may carry — a backstop against a runaway payload. */
const MAX_ITEMS = 2000;

/**
 * Coerce an edited item list. Duplicate names are summed, exactly as the sheet
 * parser does, so editing two rows into the same name behaves like uploading
 * them that way rather than silently keeping the last one.
 */
function parseItems(
  input: unknown,
): { ok: true; items: PetpoojaItem[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) {
    return { ok: false, message: "'items' must be an array" };
  }
  if (input.length > MAX_ITEMS) {
    return { ok: false, message: `At most ${MAX_ITEMS} items` };
  }

  const byKey = new Map<string, PetpoojaItem>();
  for (const raw of input as Array<{ name?: unknown; qty?: unknown }>) {
    const name = String(raw?.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) return { ok: false, message: "Every item needs a name" };

    const qty = Number(raw?.qty);
    // Same rule as the sheet parser: zero sold carries no information.
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, message: `Qty for "${name}" must be greater than 0` };
    }

    const nameKey = normalizeMaterialName(name);
    const existing = byKey.get(nameKey);
    if (existing) existing.qty = Math.round((existing.qty + qty) * 1000) / 1000;
    else byKey.set(nameKey, { name, nameKey, qty: Math.round(qty * 1000) / 1000 });
  }

  const items = [...byKey.values()];
  if (items.length === 0) {
    return { ok: false, message: "An entry needs at least one item" };
  }
  return { ok: true, items };
}

/**
 * Edit an entry's item list, and move stock to match.
 *
 * The old deduction is reversed and the new list consumed fresh, rather than
 * applying a delta: the entry's recorded lines are the only faithful record of
 * what was taken, and re-deriving a difference from recipes that may have
 * changed since would move the wrong quantities.
 *
 * Consequence worth knowing: re-consumption reads TODAY's stock and today's
 * recipes, so a corrected entry is priced and floored against the shelf as it
 * stands now, not as it stood when the entry was first recorded.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid upload id is required" },
        { status: 400 },
      );
    }

    const parsed = parseItems((await request.json())?.items);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, message: parsed.message },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(PETPOOJA_UPLOADS_COLLECTION);
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json(
        { success: false, message: "Upload not found" },
        { status: 404 },
      );
    }

    const now = new Date();
    await reversePetpoojaConsumption(
      db,
      doc.consumption as PetpoojaConsumption | undefined,
      now,
    );

    // Mirrors recordPetpoojaEntry: the list is saved even if the deduction
    // fails, because losing what was sold is the worse half to lose.
    let consumption: PetpoojaConsumption | undefined;
    let consumptionError: string | undefined;
    try {
      consumption = await consumeStockForPetpoojaItems(db, parsed.items, now);
    } catch (err) {
      console.error("Stock deduction failed for edited Petpooja entry:", err);
      consumptionError =
        err instanceof Error ? err.message : "Stock deduction failed";
    }

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          items: parsed.items,
          totalItems: parsed.items.length,
          totalQty: totalQty(parsed.items),
          editedAt: now,
          ...(consumption ? { consumption } : {}),
          ...(consumptionError ? { consumptionError } : {}),
        },
        // The old deduction is undone, so its record must not linger. Same for
        // a stale error once the retry succeeded.
        ...(consumption
          ? { $unset: { consumptionError: "" } }
          : { $unset: { consumption: "" } }),
      },
    );

    return NextResponse.json({
      success: true,
      totalItems: parsed.items.length,
      totalQty: totalQty(parsed.items),
      stockRows: consumption?.rowCount ?? 0,
      shortfallRows: consumption?.shortfallRows ?? 0,
      unmapped: consumption?.unmapped ?? [],
      consumptionError,
    });
  } catch (error) {
    console.error("Error editing Petpooja upload:", error);
    return NextResponse.json(
      { success: false, message: "Failed to edit that entry" },
      { status: 500 },
    );
  }
}

/**
 * Delete an entry and put back the stock it took.
 *
 * Restocking is not optional: an entry recorded by mistake (a sheet uploaded
 * twice, most often) has already spent stock, and removing only the record
 * would leave the shelves short with nothing left to explain why.
 *
 * The restock runs BEFORE the delete, so a failure leaves the entry in place
 * and the operation retryable. Deleting first and failing to restock would
 * lose the only record of what needs putting back.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid upload id is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(PETPOOJA_UPLOADS_COLLECTION);
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json(
        { success: false, message: "Upload not found" },
        { status: 404 },
      );
    }

    const restoredRows = await reversePetpoojaConsumption(
      db,
      doc.consumption as PetpoojaConsumption | undefined,
      new Date(),
    );
    await collection.deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true, restoredRows });
  } catch (error) {
    console.error("Error deleting Petpooja upload:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete that entry" },
      { status: 500 },
    );
  }
}
