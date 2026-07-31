import { listBrands, listCategories } from "@/lib/inventoryDb";
import { buildTemplateWorkbook } from "@/lib/rawMaterialSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Blank upload template. Lists the live category names on an Instructions
 * sheet so the user picks values the importer will actually accept.
 */
export async function GET() {
  try {
    const [categories, brands] = await Promise.all([
      listCategories(),
      listBrands(),
    ]);
    const buffer = await buildTemplateWorkbook(
      categories.map((c) => c.name),
      brands.map((b) => b.name),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="raw-materials-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building raw material template:", error);
    return Response.json(
      { success: false, message: "Failed to build template" },
      { status: 500 },
    );
  }
}
