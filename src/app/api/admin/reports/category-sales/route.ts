import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { parseIstRange } from "@/lib/adminRange";
import {
  reportOrdersInRange,
  categoryByProductId,
} from "@/lib/adminCategorySales";
import { buildCategorySalesReport } from "@/lib/categorySales";
import { buildCategorySalesWorkbook } from "@/lib/categorySalesSheet";
import { salesReportFilename } from "@/lib/reportFilename";

/**
 * The category-wise sales report as an .xlsx download.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD`, defaulting to the last 7 days like every
 * other admin stats endpoint. Admin-only (middleware-guarded).
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const now = new Date();
    const { gte, lt } = parseIstRange(
      params.get("from"),
      params.get("to"),
      now,
    );

    const { db } = await connectToDatabase();
    const { orders, productIds } = await reportOrdersInRange(db, gte, lt);

    // menuItems.category holds Category.id (a slug), so resolve the slug to a
    // readable name in one more lookup.
    const [categoryIdByProduct, categories] = await Promise.all([
      categoryByProductId(db, productIds),
      db.collection("categories").find({}).project({ id: 1, name: 1 }).toArray(),
    ]);
    const nameById = new Map<string, string>();
    for (const c of categories) {
      const id = String(c.id ?? "");
      if (id) nameById.set(id, String(c.name ?? "") || id);
    }

    const categoryOf = new Map<string, string>();
    for (const [productId, categoryId] of categoryIdByProduct) {
      const name = nameById.get(categoryId);
      if (name) categoryOf.set(productId, name);
    }

    const rows = buildCategorySalesReport(orders, categoryOf);
    const buffer = await buildCategorySalesWorkbook(rows);

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
