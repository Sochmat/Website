import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  SOCIETY_DISCOUNTS_KEY,
  sanitizeDiscountMap,
} from "@/lib/societyDiscounts";

export const dynamic = "force-dynamic";

/** Public read of per-society discounts, consumed by LocationContext. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: SOCIETY_DISCOUNTS_KEY });
    return NextResponse.json(
      { success: true, discounts: sanitizeDiscountMap(doc?.discounts) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching society discounts:", error);
    return NextResponse.json(
      { success: false, discounts: {} },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
