import { NextRequest } from "next/server";
import { listRawMaterials } from "@/lib/inventoryDb";
import { buildRawMaterialWorkbook } from "@/lib/rawMaterialSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
// Node runtime: ExcelJS is not Edge-compatible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the raw-material list as .xlsx.
 *
 * Honours the same `search`/`categoryId`/`brandId` params as the table, so "export"
 * means "export what I'm looking at". With no params it exports everything.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const materials = await listRawMaterials({
      search: searchParams.get("search") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      brandId: searchParams.get("brandId") ?? undefined,
    });

    const buffer = await buildRawMaterialWorkbook(materials);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="raw-materials-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting raw materials:", error);
    return Response.json(
      { success: false, message: "Failed to export raw materials" },
      { status: 500 },
    );
  }
}
