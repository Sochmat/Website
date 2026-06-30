import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const cards = await t.find("mealCards", { active: true }).sort({ order: 1 }).toArray();
    return NextResponse.json({ success: true, cards });
  } catch (error) {
    console.error("Error fetching meal cards:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch meal cards" },
      { status: 500 }
    );
  }
}
