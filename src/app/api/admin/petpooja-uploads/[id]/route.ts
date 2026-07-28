import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PETPOOJA_UPLOADS_COLLECTION,
  type PetpoojaItem,
  type PetpoojaRowError,
  type PetpoojaUploadDetail,
} from "@/lib/petpoojaUpload";

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
