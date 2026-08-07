import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ITEM_RECIPES_COLLECTION } from "@/lib/inventoryDb";
import {
  isMapped,
  recipeLookupKey,
  recipesByNameKey,
  variantKeyOf,
  type SellableItem,
  type SellableVariant,
} from "@/lib/menuRecipes";
import { normalizeMaterialName } from "@/lib/rawMaterials";
import type { ItemRecipe } from "@/lib/itemRecipes";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const dynamic = "force-dynamic";

/** The variant labels on a menu item doc, cleaned and de-duplicated. */
function variantNamesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const name = String((entry as { name?: unknown })?.name ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    // Two labels normalizing to one variant resolve to one recipe, so listing
    // both would offer the same sale twice.
    const variantKey = normalizeMaterialName(name);
    if (seen.has(variantKey)) continue;
    seen.add(variantKey);
    names.push(name);
  }
  return names;
}

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
 *
 * Each item carries the sizes it is sold in, so a sale can name the variant it
 * was — a Large is a different quantity of the same things, and picks its own
 * recipe where someone has written one.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [menuDocs, recipeDocs] = await Promise.all([
      db
        .collection("menuItems")
        .find({}, { projection: { name: 1, variants: 1 } })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection(ITEM_RECIPES_COLLECTION)
        .find(
          {},
          {
            projection: {
              name: 1,
              nameKey: 1,
              variantName: 1,
              variantKey: 1,
              lines: 1,
            },
          },
        )
        .toArray(),
    ]);

    const recipes: ItemRecipe[] = recipeDocs.map((d) => ({
      _id: String(d._id),
      name: String(d.name ?? ""),
      nameKey: String(d.nameKey ?? ""),
      variantName: String(d.variantName ?? ""),
      variantKey: String(d.variantKey ?? ""),
      lines: Array.isArray(d.lines) ? d.lines : [],
      totalCost: 0,
    }));
    const byKey = recipesByNameKey(recipes);

    // Every recipe written under one item name, base and variants together —
    // what an orphan row needs to list its own sizes.
    const byBaseName = new Map<string, ItemRecipe[]>();
    for (const recipe of recipes) {
      const nameKey = recipe.nameKey || normalizeMaterialName(recipe.name);
      if (!nameKey) continue;
      const group = byBaseName.get(nameKey);
      if (group) group.push(recipe);
      else byBaseName.set(nameKey, [recipe]);
    }

    /** A variant deducts its own recipe, or the base one standing in for it. */
    const variantOf = (
      nameKey: string,
      name: string,
      baseMapped: boolean,
    ): SellableVariant => {
      const variantKey = normalizeMaterialName(name);
      return {
        name,
        variantKey,
        mapped:
          isMapped(byKey.get(recipeLookupKey(nameKey, variantKey))) ||
          baseMapped,
      };
    };

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

      const mapped = isMapped(byKey.get(recipeLookupKey(nameKey)));
      items.push({
        name,
        nameKey,
        mapped,
        variants: variantNamesOf(doc.variants).map((label) =>
          variantOf(nameKey, label, mapped),
        ),
      });
    }

    for (const [nameKey, group] of byBaseName) {
      if (seen.has(nameKey)) continue;
      seen.add(nameKey);

      const base = group.find((r) => !variantKeyOf(r));
      const mapped = isMapped(base);
      items.push({
        // A group with only variant recipes has no base to name it, and every
        // recipe in it carries the same item name anyway.
        name: (base ?? group[0]).name,
        nameKey,
        mapped,
        variants: group
          .filter((r) => variantKeyOf(r))
          .map((r) => variantOf(nameKey, r.variantName ?? "", mapped)),
      });
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
