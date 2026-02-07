import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const coupons = await db
      .collection("coupons")
      .find({ active: true })
      .toArray();
    return NextResponse.json({
      success: true,
      coupons: coupons.map((c) => ({
        _id: c._id,
        code: c.code,
        discountAmount: c.discountAmount,
      })),
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}
