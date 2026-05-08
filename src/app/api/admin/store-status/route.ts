import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

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
    await db.collection("settings").updateOne(
      { key: "store" },
      { $set: { key: "store", open: body.open, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true, open: body.open });
  } catch (error) {
    console.error("Error updating store status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update store status" },
      { status: 500 },
    );
  }
}
