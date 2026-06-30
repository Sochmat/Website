import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const tiles = await t.find("categoryTiles", {}).sort({ order: 1 }).toArray();
    return NextResponse.json({ success: true, tiles });
  } catch (error) {
    console.error("Error fetching tiles:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch tiles" },
      { status: 500 }
    );
  }
}
