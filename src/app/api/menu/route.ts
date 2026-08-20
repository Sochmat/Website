import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveFoodType } from "@/lib/foodType";
import { sortAddOnCategories } from "@/lib/addOnGroups";
import type { AddOnCategory } from "@/lib/types";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = await db
      .collection("menuItems")
      .find({ hidden: { $ne: true } })
      .toArray();
    const categories = await db
      .collection("categories")
      .find({ hidden: { $ne: true } })
      .toArray();
    // Groups of add-ons an item can offer wholesale (see lib/addOnGroups.ts).
    // Hidden ones are withheld, exactly like hidden items and categories.
    const addOnCategories = await db
      .collection("addOnCategories")
      .find({ hidden: { $ne: true } })
      .toArray();

    const formattedItems = items.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      kcal: item.kcal,
      protein: item.protein,
      price: item.price,
      originalPrice: item.originalPrice,
      discount: item.discount,
      rating: item.rating,
      reviews: item.reviews,
      badge: item.badge,
      description: item.description ?? "",
      fiber: item.fiber ?? 0,
      carbs: item.carbs ?? 0,
      fat: item.fat ?? 0,
      ingredients: item.ingredients ?? [],
      image: item.image,
      foodType: resolveFoodType({
        foodType: item.foodType,
        isVeg: item.isVeg,
      }),
      isVeg: item.isVeg,
      isRecommended: item.isRecommended ?? false,
      showOnHomePage: item.showOnHomePage ?? false,
      isAvailableForSubscription: item.isAvailableForSubscription ?? false,
      addOns: item.addOns ?? [],
      variants: item.variants ?? [],
      isAddOn: item.isAddOn ?? false,
      category: item.category,
      type: item.type,
    }));

    return NextResponse.json({
      success: true,
      items: formattedItems,
      categories,
      // Already in display order, so the storefront can render them as they
      // come. The group carries the mapping: which items and which menu
      // categories it is offered on.
      addOnCategories: sortAddOnCategories(
        addOnCategories as unknown as AddOnCategory[],
      ).map((cat) => ({
        id: String(cat._id),
        name: cat.name,
        members: (cat.members ?? []).map((m) => ({
          addOnId: String(m?.addOnId ?? ""),
          price: typeof m?.price === "number" ? m.price : undefined,
        })),
        itemIds: cat.itemIds ?? [],
        menuCategoryIds: cat.menuCategoryIds ?? [],
      })),
    });
  } catch (error) {
    console.error("Error fetching menu:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch menu" },
      { status: 500 },
    );
  }
}
