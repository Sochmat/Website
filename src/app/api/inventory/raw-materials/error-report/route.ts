import { NextRequest } from "next/server";
import { buildErrorReportWorkbook } from "@/lib/rawMaterialSheet";
import type { ImportRowError } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ERRORS = 5000;

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
    const raw = Array.isArray(body?.errors) ? body.errors : [];
    if (raw.length === 0) {
      return Response.json(
        { success: false, message: "No errors to report" },
        { status: 400 },
      );
    }

    const errors: ImportRowError[] = raw
      .slice(0, MAX_ERRORS)
      .map((e: Record<string, unknown>) => ({
        rowNumber: Number(e?.rowNumber) || 0,
        name: String(e?.name ?? ""),
        message: String(e?.message ?? ""),
      }));

    const buffer = await buildErrorReportWorkbook(errors);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="raw-material-import-errors.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building import error report:", error);
    return Response.json(
      { success: false, message: "Failed to build error report" },
      { status: 500 },
    );
  }
}
