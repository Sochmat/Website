import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ITEM_RECIPES_COLLECTION } from "@/lib/inventoryDb";
import {
  isMapped,
  recipesByNameKey,
  type SellableItem,
} from "@/lib/menuRecipes";
import { normalizeMaterialName } from "@/lib/rawMaterials";
import type { ItemRecipe } from "@/lib/itemRecipes";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const dynamic = "force-dynamic";

/**
 * Everything that can be recorded as sold.
 *
 * The menu, plus any item recipe that matches no menu item — a recipe written
 * ahead of a dish, or left behind by a rename, is still something the kitchen
 * makes, and leaving it unpickable would make it unrecordable.
 *
 * Unmapped items are returned rather than filtered out, flagged instead. The
 * admin knows what Petpooja sold; hiding an item because nobody has written
 * its recipe yet would leave them unable to record a real sale, and the flag
 * says plainly that nothing will come off the shelf for it.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [menuDocs, recipeDocs] = await Promise.all([
      db
        .collection("menuItems")
        .find({}, { projection: { name: 1 } })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection(ITEM_RECIPES_COLLECTION)
        .find({}, { projection: { name: 1, nameKey: 1, lines: 1 } })
        .toArray(),
    ]);

    const recipes: ItemRecipe[] = recipeDocs.map((d) => ({
      _id: String(d._id),
      name: String(d.name ?? ""),
      nameKey: String(d.nameKey ?? ""),
      lines: Array.isArray(d.lines) ? d.lines : [],
      totalCost: 0,
    }));
    const byKey = recipesByNameKey(recipes);

    const items: SellableItem[] = [];
    const seen = new Set<string>();

    for (const doc of menuDocs) {
      const name = String(doc.name ?? "").trim();
      if (!name) continue;
      const nameKey = normalizeMaterialName(name);
      // Two menu items normalizing to one name would deduct once, so they are
      // one pickable row — listing both would invite double entry.
      if (seen.has(nameKey)) continue;
      seen.add(nameKey);
      items.push({ name, nameKey, mapped: isMapped(byKey.get(nameKey)) });
    }

    for (const recipe of recipes) {
      const nameKey = recipe.nameKey || normalizeMaterialName(recipe.name);
      if (!nameKey || seen.has(nameKey)) continue;
      seen.add(nameKey);
      items.push({ name: recipe.name, nameKey, mapped: isMapped(recipe) });
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching sellable items:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch items" },
      { status: 500 },
    );
  }
}
