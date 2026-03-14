import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const slides = await db
      .collection("bannerSlides")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, slides });
  } catch (error) {
    console.error("Error fetching banner slides:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch banner slides" },
      { status: 500 }
    );
  }
}
