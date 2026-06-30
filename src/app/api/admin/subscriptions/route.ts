import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const subscriptions = await t
      .find("subscriptions", {})
      .sort({ createdAt: -1 })
      .toArray();

    const subscriptionsWithUser = await Promise.all(
      subscriptions.map(async (sub) => {
        if (sub.receiver?.phone) {
          const user = await t.findOne("users", {
            phone: sub.receiver.phone,
          });
          return { ...sub, user };
        }
        return sub;
      })
    );

    return NextResponse.json({ success: true, subscriptions: subscriptionsWithUser });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
