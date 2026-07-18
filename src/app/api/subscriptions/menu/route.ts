import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { isBracketKey, isDiet, toPublicSubscriptionItem } from "@/lib/subscriptionBrackets";
import type { SubscriptionMenuItem } from "@/lib/types";

/**
 * Public. The items a given bracket + diet may choose from.
 *
 * Every doc goes through `toPublicSubscriptionItem`, which builds its result by
 * explicit assignment. `referencePrice` is our margin data and must never be
 * spread into a customer response.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bracket = searchParams.get("bracket");
    const diet = searchParams.get("diet");

    if (!isBracketKey(bracket)) {
      return NextResponse.json(
        { success: false, message: "Unknown bracket" },
        { status: 400 },
      );
    }
    if (!isDiet(diet)) {
      return NextResponse.json({ success: false, message: "Unknown diet" }, { status: 400 });
    }

    const filter: Record<string, unknown> = { bracket, hidden: { $ne: true } };
    // A veg-only plan never sees the non-veg list. A veg+non-veg plan sees both.
    if (diet === "veg") filter.isVeg = true;

    const { db } = await connectToDatabase();
    const docs = (await db
      .collection("subscriptionMenuItems")
      .find(filter)
      .sort({ isVeg: -1, sortOrder: 1 })
      .toArray()) as unknown as SubscriptionMenuItem[];

    return NextResponse.json({
      success: true,
      items: docs.map(toPublicSubscriptionItem),
    });
  } catch (error) {
    console.error("Error fetching subscription menu:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch menu" },
      { status: 500 },
    );
  }
}
