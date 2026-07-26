import { NextRequest } from "next/server";
import { buildRecipeErrorReportWorkbook } from "@/lib/recipeSheet";
import { toRecipeImportErrors } from "@/lib/recipeImportErrors";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn the preview's error list into a downloadable .xlsx.
 *
 * POST rather than GET because the errors are held client-side after the
 * preview step — there is nothing on the server to look them up from, and the
 * list is far too long for a query string.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const errors = toRecipeImportErrors(body?.errors);
    if (errors.length === 0) {
      return Response.json(
        { success: false, message: "No errors to report" },
        { status: 400 },
      );
    }

    const buffer = await buildRecipeErrorReportWorkbook(errors);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="item-recipe-import-errors.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building item recipe import error report:", error);
    return Response.json(
      { success: false, message: "Failed to build error report" },
      { status: 500 },
    );
  }
}
