import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  getEffectiveStoreOpen,
  DEFAULT_OPEN_MINUTES,
  DEFAULT_CLOSE_MINUTES,
  type StoreSettingsDoc,
} from "@/lib/storeState";
import { normalizeWeeklyHours, uniformWeek } from "@/lib/storeHours";

export const dynamic = "force-dynamic";

/** Current schedule config + live effective state, for the admin Store Hours page. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const store = (await db
      .collection("settings")
      .findOne({ key: "store" })) as StoreSettingsDoc | null;
    const eff = getEffectiveStoreOpen(store, new Date());
    return NextResponse.json(
      {
        success: true,
        scheduleEnabled: store?.scheduleEnabled === true,
        openMinutes: store?.openMinutes ?? DEFAULT_OPEN_MINUTES,
        closeMinutes: store?.closeMinutes ?? DEFAULT_CLOSE_MINUTES,
        // Never null: an installation still on the legacy pair gets seven
        // copies of it, purely so the editor opens on today's real hours.
        weeklyHours:
          store?.weeklyHours ??
          uniformWeek(
            store?.openMinutes ?? DEFAULT_OPEN_MINUTES,
            store?.closeMinutes ?? DEFAULT_CLOSE_MINUTES,
          ),
        usingWeeklyHours: Array.isArray(store?.weeklyHours),
        effectiveOpen: eff.open,
        overrideActive: eff.overrideActive,
        opensAtLabel: eff.opensAtLabel,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading store schedule:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read store schedule" },
      { status: 500 },
    );
  }
}

/** Update the auto-hours config. Body: { scheduleEnabled, weeklyHours }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.scheduleEnabled !== "boolean") {
      return NextResponse.json(
        { success: false, message: "'scheduleEnabled' must be a boolean" },
        { status: 400 },
      );
    }

    // The single validation gate: sorts each day and rejects overlaps, so the
    // read-side helpers can assume a sorted, non-overlapping week.
    const parsed = normalizeWeeklyHours(body.weeklyHours);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, message: parsed.message },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    await db.collection("settings").updateOne(
      { key: "store" },
      {
        $set: {
          key: "store",
          scheduleEnabled: body.scheduleEnabled,
          weeklyHours: parsed.value,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating store schedule:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update store schedule" },
      { status: 500 },
    );
  }
}
