import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import type { MenuItemSummary } from "@/lib/menuRecipes";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

/**
 * The storefront menu, as the inventory console needs it.
 *
 * Reads the same `menuItems` collection the admin Menu tab writes, but returns
 * only what the Item Recipe screen shows — no images, nutrition or pricing.
 * The category on a menu item is a category `id`, so the name is resolved here
 * rather than making the client fetch and join a second list.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [docs, categories] = await Promise.all([
      db
        .collection("menuItems")
        .find(
          {},
          {
            projection: {
              name: 1,
              category: 1,
              type: 1,
              hidden: 1,
              isAddOn: 1,
              addOns: 1,
              variants: 1,
            },
          },
        )
        .sort({ name: 1 })
        .toArray(),
      db
        .collection("categories")
        .find({}, { projection: { id: 1, name: 1 } })
        .toArray(),
    ]);

    const nameById = new Map(
      categories.map((c) => [String(c.id ?? ""), String(c.name ?? "")]),
    );

    const items: MenuItemSummary[] = docs.map((d) => ({
      _id: String(d._id),
      name: String(d.name ?? ""),
      categoryId: String(d.category ?? ""),
      // Blank rather than a stale label if the category was deleted.
      categoryName: nameById.get(String(d.category ?? "")) ?? "",
      type: String(d.type ?? ""),
      hidden: !!d.hidden,
      isAddOn: !!d.isAddOn,
      // Stored as menu item ids on the dish that offers them.
      addOnIds: Array.isArray(d.addOns)
        ? d.addOns.map((id: unknown) => String(id ?? "")).filter(Boolean)
        : [],
      // Only the labels: a variant's price is the menu's business, not the
      // recipe's.
      variantNames: Array.isArray(d.variants)
        ? d.variants
            .map((v: { name?: unknown }) => String(v?.name ?? "").trim())
            .filter(Boolean)
        : [],
    }));

    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching menu items for inventory:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch menu items" },
      { status: 500 },
    );
  }
}
