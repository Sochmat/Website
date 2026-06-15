import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

/**
 * Marks an order's payment as failed after a Razorpay failure. Only a
 * still-"pending" order is flipped to "failed" so a successful retry (which
 * sets "paid" via verify-order) is never clobbered.
 */
export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();
    if (!orderId || !ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection("orders").updateOne(
      { _id: new ObjectId(orderId), paymentStatus: "pending" },
      { $set: { paymentStatus: "failed", updatedAt: new Date() } },
    );

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("Error marking order payment failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 },
    );
  }
}
