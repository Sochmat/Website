import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  costingMaterialsById,
  isValidId,
  itemRecipesUsing,
  listProductionItems,
  recalcItemRecipeCosts,
} from "@/lib/inventoryDb";
import { sanitizeProductionItem } from "@/lib/productionItems";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** One production item, for the edit page. */
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
    // Reuse the list mapper so the shape matches exactly what the table sees.
    const item = (await listProductionItems()).find(
      (i) => String(i._id) === id,
    );
    if (!item) {
      return NextResponse.json(
        { success: false, message: "Production item not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { success: true, item },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching production item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch production item" },
      { status: 500 },
    );
  }
}

/** Update a production item, re-deriving its price from the new recipe. */
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
    const materials = await costingMaterialsById();

    const { doc, error } = sanitizeProductionItem(
      body,
      materials,
      normalizeMaterialName,
    );
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(PRODUCTION_ITEMS_COLLECTION);

    const clash = await col.findOne({
      nameKey: doc.nameKey,
      _id: { $ne: new ObjectId(id) },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "A production item with that name already exists" },
        { status: 409 },
      );
    }

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...doc, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Production item not found" },
        { status: 404 },
      );
    }

    // Item recipes may use this item as a component, so their cost moves with
    // its price.
    const repricedItemRecipes = await recalcItemRecipeCosts();

    return NextResponse.json({
      success: true,
      item: { ...doc, _id: id },
      repricedItemRecipes,
    });
  } catch (error) {
    console.error("Error updating production item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update production item" },
      { status: 500 },
    );
  }
}

/** Delete a production item, unless an item recipe still uses it as a
 *  component — that line would silently cost zero. */
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

    const inRecipes = await itemRecipesUsing("production", id);
    if (inRecipes > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${inRecipes} item recipe${inRecipes === 1 ? "" : "s"} still use${inRecipes === 1 ? "s" : ""} this production item. Remove it from them first.`,
        },
        { status: 409 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(PRODUCTION_ITEMS_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Production item not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting production item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete production item" },
      { status: 500 },
    );
  }
}
