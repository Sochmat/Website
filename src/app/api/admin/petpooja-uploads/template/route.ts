import { buildPetpoojaTemplateWorkbook } from "@/lib/petpoojaSheet";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sample format: headers, two example rows, and an Instructions sheet. */
export async function GET() {
  try {
    const buffer = await buildPetpoojaTemplateWorkbook();

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="petpooja-items-sample.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error building Petpooja template:", error);
    return Response.json(
      { success: false, message: "Failed to build the sample file" },
      { status: 500 },
    );
  }
}
