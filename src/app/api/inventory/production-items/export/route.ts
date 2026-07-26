import { NextRequest } from "next/server";
import { listProductionItems, rawMaterialNamesById } from "@/lib/inventoryDb";
import { buildProductionWorkbook } from "@/lib/recipeSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
// Node runtime: ExcelJS is not Edge-compatible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download production items as .xlsx — one sheet of items, one of recipe lines.
 *
 * Honours the same `search` param as the table, so "export" means "export what
 * I'm looking at". With no params it exports everything.
 */
export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const [items, materialNameById] = await Promise.all([
      listProductionItems(search),
      rawMaterialNamesById(),
    ]);

    const buffer = await buildProductionWorkbook(items, materialNameById);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="production-items-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting production items:", error);
    return Response.json(
      { success: false, message: "Failed to export production items" },
      { status: 500 },
    );
  }
}
