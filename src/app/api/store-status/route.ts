import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection("settings").findOne({ key: "store" });
    const open = doc?.open ?? true;
    return NextResponse.json(
      { success: true, open },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching store status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch store status", open: true },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
