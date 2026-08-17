import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  LOCATION_AVAILABILITY_KEY,
  sanitizeLocationAvailability,
} from "@/lib/locationAvailability";
import { SOCIETIES } from "@/lib/societies";

export const dynamic = "force-dynamic";

/** Per-location store/delivery switches, for the admin Store Hours page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db
      .collection("settings")
      .findOne({ key: LOCATION_AVAILABILITY_KEY });
    return NextResponse.json(
      {
        success: true,
        availability: sanitizeLocationAvailability(doc),
        // Sent alongside so the editor lists locations in the same order as the
        // storefront without importing the societies module into the page.
        locations: SOCIETIES.map((s) => ({ id: s.id, label: s.label })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading location availability:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read location availability" },
      { status: 500 },
    );
  }
}

/** Replace the switches. Body: { store: {id: bool}, delivery: {id: bool} }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Sanitize before writing: unknown ids and non-booleans are dropped, so a
    // malformed payload cannot close a location by accident.
    const availability = sanitizeLocationAvailability(body);

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: LOCATION_AVAILABILITY_KEY },
      {
        $set: {
          key: LOCATION_AVAILABILITY_KEY,
          ...availability,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true, availability });
  } catch (error) {
    console.error("Error updating location availability:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update location availability" },
      { status: 500 },
    );
  }
}
