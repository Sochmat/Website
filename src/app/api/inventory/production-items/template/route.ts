import { listRawMaterials } from "@/lib/inventoryDb";
import { buildProductionTemplateWorkbook } from "@/lib/recipeSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Blank upload template. Lists the live raw-material names on an Instructions
 * sheet so the user picks values the importer will actually accept.
 */
export async function GET() {
  try {
    const materials = await listRawMaterials();
    const buffer = await buildProductionTemplateWorkbook(
      materials.map((m) => m.name),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="production-items-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building production item template:", error);
    return Response.json(
      { success: false, message: "Failed to build template" },
      { status: 500 },
    );
  }
}
