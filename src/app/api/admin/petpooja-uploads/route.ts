import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { parsePetpoojaWorkbook } from "@/lib/petpoojaSheet";
import {
  PETPOOJA_UPLOADS_COLLECTION,
  parsePetpoojaRows,
  type PetpoojaUploadSummary,
} from "@/lib/petpoojaUpload";
import { ROW_NUMBER_KEY } from "@/lib/sheetUtils";
import { recordPetpoojaEntry } from "@/lib/petpoojaEntry";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous for a day's item list, small enough that a stray 200MB file can't
// tie up the server parsing it.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Upload history, newest first.
 *
 * Items are deliberately projected out — a day's list can run to hundreds of
 * rows and the table only shows the headline figures. The detail endpoint
 * serves the items for the one upload being opened.
 */
export async function GET(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { db } = await connectToDatabase();
    const docs = await db
      .collection(PETPOOJA_UPLOADS_COLLECTION)
      .find(
        {},
        {
          // The per-row detail is served by /[id]; the list only needs the
          // headline figures, and a day's deduction can run to hundreds of rows.
          projection: {
            items: 0,
            errors: 0,
            "consumption.productionLines": 0,
            "consumption.rawLines": 0,
          },
        },
      )
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .toArray();

    const uploads: PetpoojaUploadSummary[] = docs.map((d) => {
      const consumption = (d.consumption ?? {}) as Record<string, unknown>;
      return {
        _id: String(d._id),
        uploadedAt: new Date(d.uploadedAt).toISOString(),
        // Absent on entries written before an entry could be backdated, where
        // there was only ever one instant to record.
        ...(d.recordedAt
          ? { recordedAt: new Date(d.recordedAt).toISOString() }
          : {}),
        uploadedByRole: String(d.uploadedByRole ?? "admin"),
        // Entries predating manual entry carry no source; they were uploads.
        source: d.source === "manual" ? "manual" : "upload",
        fileName: String(d.fileName ?? ""),
        totalItems: Number(d.totalItems ?? 0),
        totalQty: Number(d.totalQty ?? 0),
        skippedRows: Number(d.skippedRows ?? 0),
        stockRows: Number(consumption.rowCount ?? 0),
        shortfallRows: Number(consumption.shortfallRows ?? 0),
        unmapped: Array.isArray(consumption.unmapped)
          ? consumption.unmapped.map(String)
          : [],
        ...(d.consumptionError
          ? { consumptionError: String(d.consumptionError) }
          : {}),
      };
    });

    return NextResponse.json(
      { success: true, uploads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching Petpooja uploads:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch uploads" },
      { status: 500 },
    );
  }
}

/**
 * Record one upload.
 *
 * The whole file lands as a single dated entry, never merged into an earlier
 * one: uploading the same list twice is two entries, which is honest about
 * what happened and leaves the admin free to ignore the duplicate.
 *
 * Rows the parser could not use are stored alongside rather than blocking the
 * upload — one blank quantity should not cost the user a hundred good rows —
 * and the response reports them so the client can say so. A file where NOTHING
 * parsed is rejected outright: there is nothing to record.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, message: "File is larger than 5 MB" },
        { status: 413 },
      );
    }

    const { rows, error } = await parsePetpoojaWorkbook(await file.arrayBuffer());
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "That sheet has no data rows" },
        { status: 400 },
      );
    }

    const { items, errors } = parsePetpoojaRows(
      rows,
      // The parser is pure and knows nothing of worksheets; hand it the real
      // row number the sheet reader stashed, so errors point at the right line.
      (row, index) => Number(row[ROW_NUMBER_KEY] ?? index + 2),
    );

    if (items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No usable rows — every row was missing a name or a quantity",
          errors,
        },
        { status: 400 },
      );
    }

    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    const { db } = await connectToDatabase();

    const recorded = await recordPetpoojaEntry(db, {
      source: "upload",
      items,
      fileName: file.name || "items.xlsx",
      errors,
      rowsRead: rows.length,
      role: session?.role ?? "admin",
    });

    return NextResponse.json({ success: true, ...recorded, errors });
  } catch (error) {
    console.error("Error saving Petpooja upload:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read that file" },
      { status: 500 },
    );
  }
}
