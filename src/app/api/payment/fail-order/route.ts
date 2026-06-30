import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

/**
 * Marks an order's payment as failed after a Razorpay failure. Only a
 * still-"pending" order is flipped to "failed" so a successful retry (which
 * sets "paid" via verify-order) is never clobbered.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;
  try {
    const { orderId } = await request.json();
    if (!orderId || !ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required" },
        { status: 400 },
      );
    }

    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const result = await t.updateOne("orders",
      { _id: new ObjectId(orderId), paymentStatus: "pending" },
      { $set: { paymentStatus: "failed", updatedAt: new Date() } },
    );

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("Error marking order payment failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 },
    );
  }
}
