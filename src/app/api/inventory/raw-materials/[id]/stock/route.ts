import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { RAW_MATERIALS_COLLECTION, isValidId } from "@/lib/inventoryDb";
import { parseStockQty } from "@/lib/stockAdjustment";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/**
 * Set a raw material's stock on hand.
 *
 * A dedicated endpoint rather than the main PUT: sanitizeRawMaterial
 * deliberately never emits `currentStock` (so editing a material can't wipe
 * its stock), and the adjustment screen has no reason to resend every other
 * field just to change one number.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid id" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { value, error } = parseStockQty(body?.currentStock);
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { currentStock: value, updatedAt: new Date() } },
      );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Raw material not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, currentStock: value });
  } catch (error) {
    console.error("Error setting raw material stock:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update stock" },
      { status: 500 },
    );
  }
}
