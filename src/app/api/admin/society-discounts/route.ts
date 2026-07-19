import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  SOCIETY_DISCOUNTS_KEY,
  sanitizeDiscountMap,
  type SocietyDiscountMap,
} from "@/lib/societyDiscounts";

export const dynamic = "force-dynamic";

/** Current per-society discount map, for the admin page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: SOCIETY_DISCOUNTS_KEY });
    const discounts = sanitizeDiscountMap(doc?.discounts);
    return NextResponse.json(
      { success: true, discounts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading society discounts:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read society discounts" },
      { status: 500 },
    );
  }
}

/** Update the per-society discount map. Body: { discounts: { [societyId]: pct } }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const discounts: SocietyDiscountMap = sanitizeDiscountMap(body?.discounts);
    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: SOCIETY_DISCOUNTS_KEY },
      {
        $set: {
          key: SOCIETY_DISCOUNTS_KEY,
          discounts,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true, discounts });
  } catch (error) {
    console.error("Error updating society discounts:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update society discounts" },
      { status: 500 },
    );
  }
}
