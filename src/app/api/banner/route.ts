import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const slides = await t.find("bannerSlides", {}).sort({ order: 1 }).toArray();
    return NextResponse.json({ success: true, slides });
  } catch (error) {
    console.error("Error fetching banner slides:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch banner slides" },
      { status: 500 }
    );
  }
}
