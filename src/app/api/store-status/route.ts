import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getEffectiveStoreOpen, type StoreSettingsDoc } from "@/lib/storeState";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [storeDoc, deliveryDoc] = await Promise.all([
      db.collection("settings").findOne({ key: "store" }),
      db.collection("settings").findOne({ key: "delivery" }),
    ]);
    const eff = getEffectiveStoreOpen(
      storeDoc as StoreSettingsDoc | null,
      new Date(),
    );
    const delivery = deliveryDoc?.on ?? true;
    return NextResponse.json(
      {
        success: true,
        open: eff.open,
        delivery,
        scheduleEnabled: eff.scheduleEnabled,
        opensAtLabel: eff.opensAtLabel,
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
