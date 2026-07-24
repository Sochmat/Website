import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId } from "@/lib/customerSession";
import { getWalletBalance } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** The signed-in customer's wallet balance, for the cart preview. 0 if signed out. */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: true, balance: 0 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { db } = await connectToDatabase();
    const balance = await getWalletBalance(db, userId);
    return NextResponse.json(
      { success: true, balance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading wallet balance:", error);
    return NextResponse.json(
      { success: false, balance: 0 },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
