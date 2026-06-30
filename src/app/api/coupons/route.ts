import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const coupons = await t.find("coupons", { active: true }).toArray();

    // Resolve the granted item (name + price) for free-item coupons so the
    // storefront can label and grant it without a second request.
    const freeItemIds = coupons
      .filter((c) => c.discountType === "freeItem" && c.freeItemId)
      .map((c) => {
        try {
          return new ObjectId(String(c.freeItemId));
        } catch {
          return null;
        }
      })
      .filter((id): id is ObjectId => id !== null);

    const freeItems = freeItemIds.length
      ? await t.find("menuItems", { _id: { $in: freeItemIds } }).toArray()
      : [];
    const freeItemById = new Map(
      freeItems.map((item) => [item._id.toString(), item]),
    );

    return NextResponse.json({
      success: true,
      coupons: coupons.map((c) => {
        const base = {
          _id: c._id,
          code: c.code,
          discountType: c.discountType ?? "flat",
          discountAmount: c.discountAmount ?? 0,
          discountPercent: c.discountPercent ?? 0,
          minAmount: c.minAmount ?? 0,
          maxDiscount: c.maxDiscount ?? 0,
        };
        if (c.discountType === "freeItem") {
          const item = c.freeItemId
            ? freeItemById.get(String(c.freeItemId))
            : undefined;
          return {
            ...base,
            freeItemId: c.freeItemId ?? "",
            freeItem: item
              ? {
                  id: item._id.toString(),
                  name: item.name,
                  price: item.price ?? 0,
                }
              : null,
          };
        }
        return base;
      }),
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch coupons" },
      { status: 500 },
    );
  }
}
