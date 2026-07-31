import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  ITEM_PRICES_COLLECTION,
  ITEM_RECIPES_COLLECTION,
} from "@/lib/inventoryDb";
import {
  buildPriceGroups,
  isPriceChannel,
  type ItemPrices,
} from "@/lib/priceComparison";
import { normalizeMaterialName } from "@/lib/rawMaterials";
import { UNCATEGORISED, type MenuItemSummary } from "@/lib/menuRecipes";
import type { ItemRecipe } from "@/lib/itemRecipes";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

/** Stored prices, keyed the way rows are matched. */
async function pricesByNameKey(db: Db): Promise<Map<string, ItemPrices>> {
  const docs = await db.collection(ITEM_PRICES_COLLECTION).find({}).toArray();
  return new Map(
    docs.map((d) => [
      String(d.nameKey ?? ""),
      {
        ...(typeof d.dineIn === "number" ? { dineIn: d.dineIn } : {}),
        ...(typeof d.zomato === "number" ? { zomato: d.zomato } : {}),
        ...(typeof d.swiggy === "number" ? { swiggy: d.swiggy } : {}),
        ...(typeof d.website === "number" ? { website: d.website } : {}),
      },
    ]),
  );
}

/**
 * Every costed item with its selling prices, by category.
 *
 * Reads the menu itself rather than going through /menu-items, because this
 * screen needs the price that endpoint deliberately leaves out.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [menuDocs, categoryDocs, recipeDocs, prices] = await Promise.all([
      db
        .collection("menuItems")
        .find({}, { projection: { name: 1, category: 1, type: 1, hidden: 1, price: 1 } })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection("categories")
        .find({}, { projection: { id: 1, name: 1 } })
        .toArray(),
      db
        .collection(ITEM_RECIPES_COLLECTION)
        .find({}, { projection: { name: 1, nameKey: 1, lines: 1, totalCost: 1 } })
        .toArray(),
      pricesByNameKey(db),
    ]);

    const categoryNameById = new Map(
      categoryDocs.map((c) => [String(c.id ?? ""), String(c.name ?? "")]),
    );

    const menuItems: (MenuItemSummary & { price?: number })[] = menuDocs.map(
      (d) => ({
        _id: String(d._id),
        name: String(d.name ?? ""),
        categoryId: String(d.category ?? ""),
        // Blank rather than a stale label if the category was deleted.
        categoryName: categoryNameById.get(String(d.category ?? "")) ?? "",
        type: String(d.type ?? ""),
        hidden: !!d.hidden,
        ...(typeof d.price === "number" ? { price: d.price } : {}),
      }),
    );

    const recipes: ItemRecipe[] = recipeDocs.map((d) => ({
      _id: String(d._id),
      name: String(d.name ?? ""),
      nameKey: String(d.nameKey ?? ""),
      lines: Array.isArray(d.lines) ? d.lines : [],
      totalCost: Number(d.totalCost ?? 0),
    }));

    const groups = buildPriceGroups({
      menuItems,
      recipes,
      pricesByNameKey: prices,
    });

    return NextResponse.json(
      { success: true, groups, uncategorised: UNCATEGORISED },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error building price comparison:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load price comparison" },
      { status: 500 },
    );
  }
}

/** Clear one channel back to unset — "nobody has entered one". */
async function clearPrice(db: Db, nameKey: string, channel: string) {
  await db
    .collection(ITEM_PRICES_COLLECTION)
    .updateOne(
      { nameKey },
      { $unset: { [channel]: "" }, $set: { updatedAt: new Date() } },
    );
}

/**
 * Set one channel's price for one item.
 *
 * A single field per request, upserted on nameKey: the table saves a cell at a
 * time as it is left, so a half-finished screen is still a saved screen, and
 * two people pricing different channels cannot overwrite each other.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body?.name ?? "").trim();
    const nameKey = String(body?.nameKey ?? "").trim() || normalizeMaterialName(name);
    if (!nameKey) {
      return NextResponse.json(
        { success: false, message: "Item is required" },
        { status: 400 },
      );
    }

    const channel = body?.channel;
    if (!isPriceChannel(channel)) {
      return NextResponse.json(
        { success: false, message: "Unknown price channel" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    const raw = body?.price;
    // null clears a price back to "nobody has entered one", which is not the
    // same as pricing the item at zero.
    if (raw === null) {
      await clearPrice(db, nameKey, channel);
      return NextResponse.json({ success: true, price: null });
    }

    const price =
      typeof raw === "number"
        ? raw
        : Number(String(raw ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { success: false, message: "Price must be a number of 0 or more" },
        { status: 400 },
      );
    }

    await db.collection(ITEM_PRICES_COLLECTION).updateOne(
      { nameKey },
      {
        $set: { [channel]: price, updatedAt: new Date() },
        // Kept for readability when someone opens the collection directly; the
        // nameKey is what everything matches on.
        $setOnInsert: { nameKey, name },
      },
      { upsert: true },
    );

    return NextResponse.json({ success: true, price });
  } catch (error) {
    console.error("Error saving price:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save that price" },
      { status: 500 },
    );
  }
}
