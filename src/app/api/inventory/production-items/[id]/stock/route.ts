import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { PRODUCTION_ITEMS_COLLECTION, isValidId } from "@/lib/inventoryDb";
import { parseStockQty } from "@/lib/stockAdjustment";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/**
 * Set a production item's stock on hand. Mirrors the raw-material stock
 * endpoint — see the note there on why this isn't part of the main PUT.
 *
 * Stock has no bearing on costing, so nothing needs recalculating here.
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
      .collection(PRODUCTION_ITEMS_COLLECTION)
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { currentStock: value, updatedAt: new Date() } },
      );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Production item not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, currentStock: value });
  } catch (error) {
    console.error("Error setting production item stock:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update stock" },
      { status: 500 },
    );
  }
}
