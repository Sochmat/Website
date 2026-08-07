import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import {
  PETPOOJA_VARIANT_COLUMN,
  parsePetpoojaRows,
} from "@/lib/petpoojaUpload";
import { recordPetpoojaEntry } from "@/lib/petpoojaEntry";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const dynamic = "force-dynamic";

// Well above any realistic sitting of the modal; a backstop against a runaway
// payload. ("manual" never collides with the sibling /[id] route: Next matches
// static segments before dynamic ones, and an id there must be an ObjectId.)
const MAX_ROWS = 2000;

/**
 * Bulk Orders Update — the same entry, typed instead of uploaded.
 *
 * Rows go through the very parser the sheet upload uses, so "the same item
 * twice is summed" and "quantity must be greater than 0" mean exactly what
 * they mean for a file. The one difference is what happens to a bad row: an
 * upload skips it and says so, because the file is not in front of the user,
 * whereas here the whole save is refused — the user typed it and can fix it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rows = Array.isArray(body?.items) ? body.items : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Add at least one item" },
        { status: 400 },
      );
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `Too many items (limit ${MAX_ROWS})` },
        { status: 413 },
      );
    }

    const { items, errors } = parsePetpoojaRows(
      // Shaped as the sheet parser expects, so both paths share one rulebook.
      rows.map((row: { name?: unknown; variant?: unknown; qty?: unknown }) => ({
        "Item Name": row?.name,
        // Only the modal fills this in; a sheet has no such column, and a
        // blank means the item was sold without a size.
        [PETPOOJA_VARIANT_COLUMN]: row?.variant,
        Qty: row?.qty,
      })),
      // No worksheet here, so "row number" is the position in the modal's list.
      (_row, index) => index + 1,
    );

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            errors.length === 1
              ? `Row ${errors[0].rowNumber}: ${errors[0].reason}`
              : `${errors.length} rows need a name and a quantity greater than 0`,
          errors,
        },
        { status: 400 },
      );
    }

    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    const { db } = await connectToDatabase();

    const recorded = await recordPetpoojaEntry(db, {
      source: "manual",
      items,
      rowsRead: rows.length,
      role: session?.role ?? "admin",
    });

    return NextResponse.json({ success: true, ...recorded });
  } catch (error) {
    console.error("Error saving Petpooja manual entry:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save that entry" },
      { status: 500 },
    );
  }
}
