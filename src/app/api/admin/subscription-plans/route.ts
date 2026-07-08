import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // yyyy-mm-dd, optional

    const { db } = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    // Only paid plans matter for the kitchen/delivery view.
    if (date) filter["days.date"] = date;

    const plans = await db
      .collection("subscriptionPlans")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error("Error fetching admin subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscription plans" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { _id, status } = await request.json();
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }
    if (!["active", "cancelled", "completed"].includes(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status" },
        { status: 400 },
      );
    }
    const { db } = await connectToDatabase();
    const result = await db
      .collection("subscriptionPlans")
      .updateOne(
        { _id: new ObjectId(_id) },
        { $set: { status, updatedAt: new Date() } },
      );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating admin subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update subscription plan" },
      { status: 500 },
    );
  }
}
