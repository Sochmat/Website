import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  ITEM_RECIPES_COLLECTION,
  componentCostsByKey,
  isValidId,
  listItemRecipes,
} from "@/lib/inventoryDb";
import { sanitizeItemRecipe } from "@/lib/itemRecipes";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** One item recipe, for the edit page. */
export async function GET(
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
    const recipe = (await listItemRecipes()).find((r) => String(r._id) === id);
    if (!recipe) {
      return NextResponse.json(
        { success: false, message: "Item recipe not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { success: true, recipe },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching item recipe:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch item recipe" },
      { status: 500 },
    );
  }
}

/** Update an item recipe, re-deriving its cost. */
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
    const components = await componentCostsByKey();

    const { doc, error } = sanitizeItemRecipe(
      body,
      components,
      normalizeMaterialName,
    );
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(ITEM_RECIPES_COLLECTION);

    const clash = await col.findOne({
      nameKey: doc.nameKey,
      _id: { $ne: new ObjectId(id) },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "An item recipe with that name already exists" },
        { status: 409 },
      );
    }

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...doc, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Item recipe not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, recipe: { ...doc, _id: id } });
  } catch (error) {
    console.error("Error updating item recipe:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update item recipe" },
      { status: 500 },
    );
  }
}

/** Delete an item recipe. Nothing references item recipes, so no guard. */
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
    const result = await db
      .collection(ITEM_RECIPES_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Item recipe not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting item recipe:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete item recipe" },
      { status: 500 },
    );
  }
}
