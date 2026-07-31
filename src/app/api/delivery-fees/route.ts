import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DELIVERY_FEES_KEY,
  DEFAULT_RULE,
  sanitizeDeliveryFeeConfig,
} from "@/lib/deliveryFees";

export const dynamic = "force-dynamic";

/**
 * The small-order delivery fee rules, for the cart preview. Public: the numbers
 * are shown on the bill anyway, and the order route recomputes the fee
 * authoritatively at creation regardless of what the client believed.
 */
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
    // Fail open to free delivery rather than showing a fee we can't verify.
    return NextResponse.json(
      { success: false, default: DEFAULT_RULE, byLocation: {} },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
