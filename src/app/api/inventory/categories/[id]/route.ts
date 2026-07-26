import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  CATEGORIES_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  escapeRegExp,
  isValidId,
} from "@/lib/inventoryDb";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** Rename a category. Names stay unique case-insensitively. */
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
    const col = db.collection(CATEGORIES_COLLECTION);

    const clash = await col.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      _id: { $ne: new ObjectId(id) },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "That category already exists" },
        { status: 409 },
      );
    }

    // Materials reference the category by id, so a rename needs no cascade —
    // the name is resolved on read.
    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { name } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, category: { _id: id, name } });
  } catch (error) {
    console.error("Error renaming inventory category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to rename category" },
      { status: 500 },
    );
  }
}

/**
 * Delete a category, but only if nothing references it.
 *
 * Materials store a categoryId, so deleting one still in use would leave those
 * rows pointing at nothing — they'd show a blank category and fail validation
 * on their next edit. Refusing with a count is more useful than cascading.
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
      .countDocuments({ categoryId: id });
    if (inUse > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${inUse} raw material${inUse === 1 ? "" : "s"} still use${inUse === 1 ? "s" : ""} this category. Reassign them first.`,
        },
        { status: 409 },
      );
    }

    const result = await db
      .collection(CATEGORIES_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete category" },
      { status: 500 },
    );
  }
}
