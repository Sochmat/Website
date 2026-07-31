import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  componentCostsByKey,
  isValidId,
  itemRecipesUsing,
  listProductionItems,
  productionItemsUsing,
  productionRecipesById,
  recalcItemRecipeCosts,
  recalcProductionItemPrices,
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
    const [components, recipesById] = await Promise.all([
      componentCostsByKey(),
      productionRecipesById(),
    ]);

    // The graph is what rejects a recipe that reaches back to this item —
    // directly, or through a chain of other production items.
    const { doc, error } = sanitizeProductionItem(
      body,
      components,
      normalizeMaterialName,
      { selfId: id, recipesById },
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

    // Other production items may be built on this one, so their prices move
    // with it; item recipes may use either, so they settle after.
    const repricedProductionItems = await recalcProductionItemPrices();
    const repricedItemRecipes = await recalcItemRecipeCosts();

    return NextResponse.json({
      success: true,
      item: { ...doc, _id: id },
      repricedProductionItems,
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

/** Delete a production item, unless an item recipe or another production item
 *  still uses it as a component — that line would silently cost zero. */
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

    // A recipe may now nest production items, so this item can be a component
    // one level down as well as one level up. Both are checked.
    const inProduction = await productionItemsUsing(id, "production");
    if (inProduction > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${inProduction} production item${inProduction === 1 ? "" : "s"} still use${inProduction === 1 ? "s" : ""} this item in their recipe. Remove it from them first.`,
        },
        { status: 409 },
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
