import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sanitizeExemptDates } from "@/lib/rewards";
import { STREAK_EXEMPT_DATES_KEY } from "@/lib/rewardPoints";

export const dynamic = "force-dynamic";

/** Dates that don't break a reward streak, for the admin Store Hours page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: STREAK_EXEMPT_DATES_KEY });
    return NextResponse.json(
      { success: true, dates: sanitizeExemptDates(doc?.dates) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading streak holidays:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read streak holidays" },
      { status: 500 },
    );
  }
}

/** Replace the holiday list. Body: { dates: string[] } of yyyy-mm-dd. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.dates)) {
      return NextResponse.json(
        { success: false, message: "'dates' must be an array" },
        { status: 400 },
      );
    }
    const dates = sanitizeExemptDates(body.dates);

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: STREAK_EXEMPT_DATES_KEY },
      {
        $set: {
          key: STREAK_EXEMPT_DATES_KEY,
          dates,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true, dates });
  } catch (error) {
    console.error("Error updating streak holidays:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update streak holidays" },
      { status: 500 },
    );
  }
}
