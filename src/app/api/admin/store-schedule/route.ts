import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  getEffectiveStoreOpen,
  DEFAULT_OPEN_MINUTES,
  DEFAULT_CLOSE_MINUTES,
  type StoreSettingsDoc,
} from "@/lib/storeState";

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
        effectiveOpen: eff.open,
        overrideActive: eff.overrideActive,
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

function isMinute(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1439;
}

/** Update the auto-hours config. Body: { scheduleEnabled, openMinutes, closeMinutes }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.scheduleEnabled !== "boolean") {
      return NextResponse.json(
        { success: false, message: "'scheduleEnabled' must be a boolean" },
        { status: 400 },
      );
    }
    if (!isMinute(body.openMinutes) || !isMinute(body.closeMinutes)) {
      return NextResponse.json(
        {
          success: false,
          message: "openMinutes/closeMinutes must be integers 0–1439",
        },
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
          openMinutes: body.openMinutes,
          closeMinutes: body.closeMinutes,
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
