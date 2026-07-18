import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { nextBoundary } from "@/lib/ist";
import { DEFAULT_OPEN_MINUTES, DEFAULT_CLOSE_MINUTES } from "@/lib/storeState";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.open !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Body must include boolean 'open'" },
        { status: 400 },
      );
    }
    const { db } = await connectToDatabase();
    const store = await db.collection("settings").findOne({ key: "store" });

    if (store?.scheduleEnabled === true) {
      // Schedule is running → the tap is a manual override that holds only until
      // the next open/close boundary, after which the schedule takes back over.
      const openMin = store.openMinutes ?? DEFAULT_OPEN_MINUTES;
      const closeMin = store.closeMinutes ?? DEFAULT_CLOSE_MINUTES;
      const overrideUntil = nextBoundary(new Date(), openMin, closeMin);
      await db.collection("settings").updateOne(
        { key: "store" },
        {
          $set: {
            key: "store",
            overrideValue: body.open,
            overrideUntil,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } else {
      // No schedule → permanent manual flag, exactly as before.
      await db.collection("settings").updateOne(
        { key: "store" },
        { $set: { key: "store", open: body.open, updatedAt: new Date() } },
        { upsert: true },
      );
    }
    return NextResponse.json({ success: true, open: body.open });
  } catch (error) {
    console.error("Error updating store status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update store status" },
      { status: 500 },
    );
  }
}
