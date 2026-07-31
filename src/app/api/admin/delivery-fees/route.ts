import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DELIVERY_FEES_KEY,
  sanitizeDeliveryFeeConfig,
} from "@/lib/deliveryFees";

export const dynamic = "force-dynamic";

/** Small-order delivery fee rules, for the admin Delivery Fees page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: DELIVERY_FEES_KEY });
    return NextResponse.json(
      { success: true, ...sanitizeDeliveryFeeConfig(doc) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading delivery fees:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read delivery fees" },
      { status: 500 },
    );
  }
}

/**
 * Replace the rules. Body: `{ default: {threshold, fee}, byLocation: {...} }`.
 *
 * Stored wholesale rather than merged: omitting a location from `byLocation` is
 * how it goes back to inheriting the default, which a merge could not express.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "A rules object is required" },
        { status: 400 },
      );
    }
    const config = sanitizeDeliveryFeeConfig(body);

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: DELIVERY_FEES_KEY },
      { $set: { key: DELIVERY_FEES_KEY, ...config, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true, ...config });
  } catch (error) {
    console.error("Error updating delivery fees:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update delivery fees" },
      { status: 500 },
    );
  }
}
