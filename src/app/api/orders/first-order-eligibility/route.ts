import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId } from "@/lib/customerSession";
import { isEligibleForFirstOrderDiscount } from "@/lib/orderEligibility";

export const dynamic = "force-dynamic";

/**
 * Whether the signed-in customer qualifies for the 20% first-order discount.
 * Used only to preview the discount on the cart — the order route re-checks
 * authoritatively at creation. Returns `eligible: false` when not signed in.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: true, eligible: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { db } = await connectToDatabase();
    const eligible = await isEligibleForFirstOrderDiscount(db, userId);
    return NextResponse.json(
      { success: true, eligible },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error checking first-order eligibility:", error);
    return NextResponse.json(
      { success: false, eligible: false },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
