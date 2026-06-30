import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const body = await request.json();
    if (typeof body?.on !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Body must include boolean 'on'" },
        { status: 400 },
      );
    }
    await t.updateOne(
      "settings",
      { key: "delivery" },
      { $set: { key: "delivery", on: body.on, updatedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ success: true, on: body.on });
  } catch (error) {
    console.error("Error updating delivery status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update delivery status" },
      { status: 500 },
    );
  }
}
