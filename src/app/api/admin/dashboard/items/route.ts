import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { parseIstRange } from "@/lib/adminRange";
import { itemSalesInRange } from "@/lib/adminItemSales";

/**
 * Every item sold in an IST date range, busiest first — the uncapped form of
 * the dashboard's top-sellers panel. `?from=YYYY-MM-DD&to=YYYY-MM-DD`, defaults
 * to the last 7 days. Admin-only (middleware-guarded).
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const { from, to, gte, lt } = parseIstRange(
      params.get("from"),
      params.get("to"),
      new Date(),
    );

    const { db } = await connectToDatabase();
    const items = await itemSalesInRange(db, gte, lt);

    return NextResponse.json({
      success: true,
      range: { from, to },
      items,
      totals: {
        quantity: items.reduce((sum, i) => sum + i.quantity, 0),
        revenue: items.reduce((sum, i) => sum + i.revenue, 0),
      },
    });
  } catch (error) {
    console.error("Error building item sales:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build item sales" },
      { status: 500 },
    );
  }
}
