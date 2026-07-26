import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  BRANDS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  escapeRegExp,
  isValidId,
} from "@/lib/inventoryDb";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** Rename a brand. Names stay unique case-insensitively. */
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
    const name = String(body?.name ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(BRANDS_COLLECTION);

    const clash = await col.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      _id: { $ne: new ObjectId(id) },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "That brand already exists" },
        { status: 409 },
      );
    }

    // Materials reference the brand by id, so a rename needs no cascade.
    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { name } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Brand not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, brand: { _id: id, name } });
  } catch (error) {
    console.error("Error renaming inventory brand:", error);
    return NextResponse.json(
      { success: false, message: "Failed to rename brand" },
      { status: 500 },
    );
  }
}

/**
 * Delete a brand, but only if nothing references it.
 *
 * Brand is optional on a material, so a cascade to "" would arguably be safe
 * here — but silently unbranding a set of materials is a surprising side
 * effect of deleting a list entry. Refusing with a count keeps the operator in
 * control, and matches how categories behave.
 */
export async function DELETE(
  _request: NextRequest,
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

    const { db } = await connectToDatabase();

    const inUse = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .countDocuments({ brandId: id });
    if (inUse > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${inUse} raw material${inUse === 1 ? "" : "s"} still use${inUse === 1 ? "s" : ""} this brand. Reassign them first.`,
        },
        { status: 409 },
      );
    }

    const result = await db
      .collection(BRANDS_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Brand not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory brand:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete brand" },
      { status: 500 },
    );
  }
}
