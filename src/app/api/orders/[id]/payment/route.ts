import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Direct payment-status writes are admin-only. The customer payment path
    // goes through /api/payment/verify-order, which validates the Razorpay
    // signature + amount. Without this gate anyone could mark orders paid.
    const session = await verifySession(
      request.cookies.get(ADMIN_COOKIE)?.value
    );
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { paymentStatus, paymentId } = await request.json();
    const { id: orderId } = await params;

    if (!ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 }
      );
    }

    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const updateData: any = {
      paymentStatus,
      updatedAt: new Date(),
    };

    if (paymentId) {
      updateData.paymentId = paymentId;
    }

    const result = await t.updateOne("orders",
      { _id: new ObjectId(orderId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = await t.findOne("orders", { _id: new ObjectId(orderId) });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Error updating order payment:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order payment" },
      { status: 500 }
    );
  }
}
