import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const [storeDoc, deliveryDoc] = await Promise.all([
      t.findOne("settings", { key: "store" }),
      t.findOne("settings", { key: "delivery" }),
    ]);
    const open = storeDoc?.open ?? true;
    const delivery = deliveryDoc?.on ?? true;
    return NextResponse.json(
      { success: true, open, delivery },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching store status:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch store status",
        open: true,
        delivery: true,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
