import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { STREAK_LADDERS_KEY, sanitizeStreakConfig } from "@/lib/streakLadder";

export const dynamic = "force-dynamic";

/** Per-location reward ladders, for the admin Streak page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: STREAK_LADDERS_KEY });
    return NextResponse.json(
      { success: true, ...sanitizeStreakConfig(doc) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading streak ladders:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read streak ladders" },
      { status: 500 },
    );
  }
}

/**
 * Replace the whole config. Body:
 * `{ ladders: { [locationId|"default"]: number[] }, disabled: locationId[] }`.
 *
 * Stored wholesale rather than merged: omitting a location from `ladders` is how
 * it goes back to inheriting the default, and omitting it from `disabled` is how
 * it is switched back on. A merge would make both impossible to express.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.ladders || typeof body.ladders !== "object") {
      return NextResponse.json(
        { success: false, message: "'ladders' must be an object" },
        { status: 400 },
      );
    }
    const config = sanitizeStreakConfig(body);

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: STREAK_LADDERS_KEY },
      { $set: { key: STREAK_LADDERS_KEY, ...config, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true, ...config });
  } catch (error) {
    console.error("Error updating streak ladders:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update streak ladders" },
      { status: 500 },
    );
  }
}
