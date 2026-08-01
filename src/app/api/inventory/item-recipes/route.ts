import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  ITEM_RECIPES_COLLECTION,
  componentCostsByKey,
  itemRecipeGraph,
  listItemRecipes,
} from "@/lib/inventoryDb";
import { sanitizeItemRecipe } from "@/lib/itemRecipes";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

/** List, optionally filtered by `search` (name substring). */
export async function GET(request: NextRequest) {
  try {
    const recipes = await listItemRecipes(
      request.nextUrl.searchParams.get("search") ?? undefined,
    );
    return NextResponse.json(
      { success: true, recipes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching item recipes:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch item recipes" },
      { status: 500 },
    );
  }
}

/**
 * Create an item recipe.
 *
 * The cost is derived from the components' current prices, never taken from
 * the request — the same contract as production items.
 *
 * No selfId on the graph: a recipe that does not exist yet cannot be pointed
 * at, so nothing it names can lead back to it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [components, graph] = await Promise.all([
      componentCostsByKey(),
      itemRecipeGraph(),
    ]);

    const { doc, error } = sanitizeItemRecipe(
      body,
      components,
      normalizeMaterialName,
      graph,
    );
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(ITEM_RECIPES_COLLECTION);

    if (await col.findOne({ nameKey: doc.nameKey })) {
      return NextResponse.json(
        { success: false, message: "An item recipe with that name already exists" },
        { status: 409 },
      );
    }

    const now = new Date();
    const result = await col.insertOne({ ...doc, createdAt: now, updatedAt: now });
    return NextResponse.json({
      success: true,
      recipe: { ...doc, _id: String(result.insertedId) },
    });
  } catch (error) {
    console.error("Error creating item recipe:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create item recipe" },
      { status: 500 },
    );
  }
}
