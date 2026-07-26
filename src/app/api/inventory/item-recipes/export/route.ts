import { NextRequest } from "next/server";
import { componentNamesByKey, listItemRecipes } from "@/lib/inventoryDb";
import { buildItemRecipeWorkbook } from "@/lib/recipeSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
// Node runtime: ExcelJS is not Edge-compatible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download item recipes as .xlsx — one sheet of recipes, one of components.
 *
 * Honours the same `search` param as the table, so "export" means "export what
 * I'm looking at". With no params it exports everything.
 */
export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const [recipes, componentNames] = await Promise.all([
      listItemRecipes(search),
      componentNamesByKey(),
    ]);

    const buffer = await buildItemRecipeWorkbook(recipes, componentNames);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="item-recipes-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting item recipes:", error);
    return Response.json(
      { success: false, message: "Failed to export item recipes" },
      { status: 500 },
    );
  }
}
