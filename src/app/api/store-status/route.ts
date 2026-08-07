import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getEffectiveStoreOpen, type StoreSettingsDoc } from "@/lib/storeState";
import {
  LOCATION_AVAILABILITY_KEY,
  sanitizeLocationAvailability,
  isStoreOnAt,
  isDeliveryOnAt,
} from "@/lib/locationAvailability";

export const dynamic = "force-dynamic";

/**
 * Live store/delivery state. Pass `?societyId=` to get the answer for one
 * location; without it the caller gets the global state, which is what the
 * pre-location callers already expected.
 */
export async function GET(request: NextRequest) {
  try {
    const societyId = request.nextUrl.searchParams.get("societyId");
    const { db } = await connectToDatabase();
    const [storeDoc, deliveryDoc, availabilityDoc] = await Promise.all([
      db.collection("settings").findOne({ key: "store" }),
      db.collection("settings").findOne({ key: "delivery" }),
      db.collection("settings").findOne({ key: LOCATION_AVAILABILITY_KEY }),
    ]);
    const eff = getEffectiveStoreOpen(
      storeDoc as StoreSettingsDoc | null,
      new Date(),
    );
    const availability = sanitizeLocationAvailability(availabilityDoc);
    // Location switches can only close, matching the order route's gates.
    const open = eff.open && isStoreOnAt(availability, societyId);
    const delivery =
      (deliveryDoc?.on ?? true) && isDeliveryOnAt(availability, societyId);
    return NextResponse.json(
      {
        success: true,
        open,
        delivery,
        scheduleEnabled: eff.scheduleEnabled,
        // A location switched off has no reopen time, so don't imply one.
        // (`eff.opensAtLabel` is already null whenever the store is open.)
        opensAtLabel: isStoreOnAt(availability, societyId)
          ? eff.opensAtLabel
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching store status:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch store status",
        open: true,
        delivery: true,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
