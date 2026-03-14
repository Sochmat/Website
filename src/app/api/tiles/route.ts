import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const tiles = await db
      .collection("categoryTiles")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, tiles });
  } catch (error) {
    console.error("Error fetching tiles:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch tiles" },
      { status: 500 }
    );
  }
}
