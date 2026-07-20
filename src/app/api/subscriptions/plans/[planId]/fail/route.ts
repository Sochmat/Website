import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { refundReservationForPlan } from "@/lib/wallet";

/**
 * Called when a plan's Razorpay payment fails or is dismissed. Refunds any
 * reserved wallet back to the customer. Idempotent and ownership-checked; only
 * touches a still-`pending` plan, so a later successful retry is never disturbed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { planId } = await params;
    if (!planId || !ObjectId.isValid(planId)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const refunded = await refundReservationForPlan(db, new ObjectId(planId), userId);
    return NextResponse.json({ success: true, refunded });
  } catch (error) {
    console.error("Error failing subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to release plan" },
      { status: 500 },
    );
  }
}
