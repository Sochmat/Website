import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import type { SubscriptionBracket } from "@/lib/types";

/** Public. The prices are exactly what we charge, so there is nothing to hide here. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const docs = (await db
      .collection("subscriptionBrackets")
      .find({ active: { $ne: false } })
      .sort({ sortOrder: 1 })
      .toArray()) as unknown as SubscriptionBracket[];

    const brackets = docs.map((b) => ({
      key: b.key,
      label: b.label,
      proteinMin: b.proteinMin,
      proteinMax: b.proteinMax,
      vegPrice: b.vegPrice,
      nonVegPrice: b.nonVegPrice,
      sortOrder: b.sortOrder,
    }));

    return NextResponse.json({ success: true, brackets });
  } catch (error) {
    console.error("Error fetching brackets:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch brackets" },
      { status: 500 },
    );
  }
}
