import { listProductionItems, listRawMaterials } from "@/lib/inventoryDb";
import { buildItemRecipeTemplateWorkbook } from "@/lib/recipeSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Blank upload template. Lists the live raw-material and production-item names
 * on an Instructions sheet, split by the Type value each one needs.
 */
export async function GET() {
  try {
    const [materials, items] = await Promise.all([
      listRawMaterials(),
      listProductionItems(),
    ]);
    const buffer = await buildItemRecipeTemplateWorkbook(
      materials.map((m) => m.name),
      items.map((i) => i.name),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="item-recipes-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building item recipe template:", error);
    return Response.json(
      { success: false, message: "Failed to build template" },
      { status: 500 },
    );
  }
}
