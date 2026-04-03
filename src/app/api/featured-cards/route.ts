import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const cards = await db
      .collection("featuredCards")
      .find({ active: true })
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, cards });
  } catch (error) {
    console.error("Error fetching featured cards:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch featured cards" },
      { status: 500 }
    );
  }
}
