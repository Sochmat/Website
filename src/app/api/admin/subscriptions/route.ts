import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const subscriptions = await db
      .collection("subscriptions")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    const subscriptionsWithUser = await Promise.all(
      subscriptions.map(async (sub) => {
        if (sub.receiver?.phone) {
          const user = await db.collection("users").findOne({
            phone: sub.receiver.phone,
          });
          return { ...sub, user };
        }
        return sub;
      })
    );

    return NextResponse.json({ success: true, subscriptions: subscriptionsWithUser });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
