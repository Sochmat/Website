import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { parseIstRange } from "@/lib/adminRange";
import { itemSalesInRange } from "@/lib/adminItemSales";
import { groupByCategory } from "@/lib/categorySales";
import { buildCategorySalesWorkbook } from "@/lib/categorySalesSheet";
import { salesReportFilename, istTimestampLabel } from "@/lib/reportFilename";

/**
 * The category-wise sales report as an .xlsx download.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD`, defaulting to the last 7 days like every
 * other admin stats endpoint. Admin-only (middleware-guarded).
 *
 * Shares `itemSalesInRange` with the dashboard on purpose: the report and the
 * top-sellers panel are the same numbers, so they must not drift apart.
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const now = new Date();
    const { from, to, gte, lt } = parseIstRange(
      params.get("from"),
      params.get("to"),
      now,
    );

    const { db } = await connectToDatabase();
    const [items, categories] = await Promise.all([
      itemSalesInRange(db, gte, lt),
      db
        .collection("categories")
        .find({})
        .project({ id: 1, name: 1 })
        .toArray(),
    ]);

    // menuItems.category holds Category.id (a slug), not the _id.
    const categoryNames = new Map<string, string>();
    for (const c of categories) {
      const id = String(c.id ?? "");
      if (id) categoryNames.set(id, String(c.name ?? "") || id);
    }

    const report = groupByCategory(items, categoryNames);
    const buffer = await buildCategorySalesWorkbook(report, {
      from,
      to,
      generatedAt: istTimestampLabel(now),
    });

    const filename = salesReportFilename(now);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // The client reads the name back off the header, which a cross-origin
        // fetch would otherwise hide. Same-origin today, explicit anyway.
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building category sales report:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build the sales report" },
      { status: 500 },
    );
  }
}
