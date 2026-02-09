import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = await db.collection("menuItems").find({}).toArray();
    const categories = await db.collection("categories").find({}).toArray();

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
      image: item.image,
      isVeg: item.isVeg,
      isRecommended: item.isRecommended ?? false,
      showOnHomePage: item.showOnHomePage ?? false,
      category: item.category,
      type: item.type,
    }));

    return NextResponse.json({
      success: true,
      items: formattedItems,
      categories,
    });
  } catch (error) {
    console.error("Error fetching menu:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch menu" },
      { status: 500 }
    );
  }
}
