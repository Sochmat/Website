import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  RAW_MATERIALS_COLLECTION,
  isValidId,
  listBrands,
  listCategories,
  itemRecipesUsing,
  productionItemsUsing,
  recalcDerivedCosts,
} from "@/lib/inventoryDb";
import { sanitizeRawMaterial } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** Update one raw material. Same validation gate as create. */
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
    const [categories, brands] = await Promise.all([
      listCategories(),
      listBrands(),
    ]);
    const validIds = new Set(categories.map((c) => String(c._id)));
    const validBrandIds = new Set(brands.map((b) => String(b._id)));

    const { doc, error } = sanitizeRawMaterial(body, validIds, validBrandIds);
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(RAW_MATERIALS_COLLECTION);

    // A rename must not collide with a different existing material.
    const clash = await col.findOne({
      nameKey: doc.nameKey,
      _id: { $ne: new ObjectId(id) },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "A raw material with that name already exists" },
        { status: 409 },
      );
    }

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...doc, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Raw material not found" },
        { status: 404 },
      );
    }

    // Production-item prices and item-recipe costs are cached derivations of
    // raw-material prices, so any edit here can invalidate both. Settle them
    // before replying.
    const repriced = await recalcDerivedCosts([id]);

    return NextResponse.json({
      success: true,
      material: { ...doc, _id: id },
      repricedProductionItems: repriced.productionItems,
      repricedItemRecipes: repriced.itemRecipes,
    });
  } catch (error) {
    console.error("Error updating raw material:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update raw material" },
      { status: 500 },
    );
  }
}

/** Delete one raw material. */
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

    // Deleting a material that a recipe depends on would silently cost that
    // line at zero and quietly understate the production item's price. Refuse,
    // matching how categories and brands behave.
    const [inProduction, inRecipes] = await Promise.all([
      productionItemsUsing(id),
      itemRecipesUsing("raw", id),
    ]);
    if (inProduction > 0 || inRecipes > 0) {
      const parts = [
        inProduction > 0
          ? `${inProduction} production item${inProduction === 1 ? "" : "s"}`
          : "",
        inRecipes > 0
          ? `${inRecipes} item recipe${inRecipes === 1 ? "" : "s"}`
          : "",
      ].filter(Boolean);
      return NextResponse.json(
        {
          success: false,
          message: `${parts.join(" and ")} still use this raw material. Remove it from them first.`,
        },
        { status: 409 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Raw material not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting raw material:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete raw material" },
      { status: 500 },
    );
  }
}
