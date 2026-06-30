import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import { kotDayKey, nextKotNumber, nextBillNumber } from "@/lib/kotCounter";
import { getTenantId } from "@/lib/tenant";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const orders = await db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const productIds = new Set<string>();
    for (const order of orders) {
      const items = (order.orderItems ?? []) as Array<{ productId?: string }>;
      for (const item of items) {
        if (item?.productId) productIds.add(String(item.productId));
      }
    }

    const objectIds: ObjectId[] = [];
    const rawIds: string[] = [];
    for (const id of productIds) {
      try {
        objectIds.push(new ObjectId(id));
      } catch {
        rawIds.push(id);
      }
    }

    const orQuery: Record<string, unknown>[] = [];
    if (objectIds.length) orQuery.push({ _id: { $in: objectIds } });
    if (rawIds.length) orQuery.push({ _id: { $in: rawIds } });

    const products = orQuery.length
      ? await db
          .collection("menuItems")
          .find({ $or: orQuery })
          .project({ name: 1, image: 1 })
          .toArray()
      : [];

    const productMap = new Map<string, { name: string; image?: string }>();
    for (const p of products) {
      productMap.set(String(p._id), { name: String(p.name ?? ""), image: p.image });
    }

    const enriched = orders.map((order) => {
      const items = ((order.orderItems ?? []) as Array<{
        productId?: string;
        quantity?: number;
        price?: number;
      }>).map((item) => {
        const product = item.productId ? productMap.get(String(item.productId)) : undefined;
        return {
          ...item,
          name: product?.name ?? "Unknown product",
          image: product?.image,
        };
      });
      return { ...order, orderItems: items };
    });

    return NextResponse.json({ success: true, orders: enriched });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, paymentStatus, printBill, reject } = await req.json();
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid order id is required" },
        { status: 400 }
      );
    }
    // Reject unknown status values before they can be written to the DB.
    if (status !== undefined && !ORDER_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status" },
        { status: 400 }
      );
    }
    if (
      paymentStatus !== undefined &&
      !PAYMENT_STATUSES.includes(paymentStatus)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid payment status" },
        { status: 400 }
      );
    }

    // Reject = cancel the order and, if it was paid, issue a real Razorpay
    // refund. The order is only cancelled once the refund succeeds, so a
    // failed refund leaves the order untouched for the admin to retry.
    if (reject) {
      const { db } = await connectToDatabase();
      const _id = new ObjectId(id);
      const order = await db.collection("orders").findOne({ _id });
      if (!order) {
        return NextResponse.json(
          { success: false, message: "Order not found" },
          { status: 404 }
        );
      }

      const rejectUpdate: Record<string, unknown> = {
        status: "cancelled",
        updatedAt: new Date(),
      };
      let refunded = false;

      if (order.paymentStatus === "paid") {
        if (!order.paymentId) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Order is paid but has no payment id; cannot auto-refund.",
            },
            { status: 422 }
          );
        }
        try {
          const refund = await razorpay.payments.refund(
            String(order.paymentId),
            { speed: "normal" }
          );
          rejectUpdate.paymentStatus = "refunded";
          rejectUpdate.refundId = refund.id;
          rejectUpdate.refundedAt = new Date();
          refunded = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Refund failed";
          console.error("Razorpay refund failed:", err);
          return NextResponse.json(
            { success: false, message: `Refund failed: ${msg}` },
            { status: 502 }
          );
        }
      }

      await db
        .collection("orders")
        .updateOne({ _id }, { $set: rejectUpdate });

      return NextResponse.json({
        success: true,
        status: "cancelled",
        paymentStatus: rejectUpdate.paymentStatus ?? order.paymentStatus,
        refunded,
      });
    }

    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;

    if (Object.keys(update).length === 0 && !printBill) {
      return NextResponse.json(
        { success: false, message: "Nothing to update" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const tenantId = await getTenantId();
    const _id = new ObjectId(id);

    // On the first transition to "confirmed", allocate a daily KOT number and
    // queue the order for printing. Idempotent: re-confirming won't renumber.
    let kotNumber: number | undefined;
    let confirmedAt: Date | undefined;
    if (update.status === "confirmed") {
      const existing = await db
        .collection("orders")
        .findOne({ _id }, { projection: { kotNumber: 1, confirmedAt: 1 } });
      if (existing && existing.kotNumber == null) {
        const day = kotDayKey();
        kotNumber = await nextKotNumber(tenantId, day);
        update.kotNumber = kotNumber;
        update.kotDate = day;
        update.kotPrinted = false;
      } else if (existing) {
        kotNumber = existing.kotNumber as number;
      }
      // Stamp the confirmation time once, so the shop timer is stable.
      if (existing && existing.confirmedAt == null) {
        confirmedAt = new Date();
        update.confirmedAt = confirmedAt;
      } else if (existing) {
        confirmedAt = existing.confirmedAt as Date;
      }
    }

    // Queue the bill when explicitly requested ("Print Bill") or automatically
    // on the first transition to "confirmed" (Accept). Assigns a global bill
    // number once. Manual "Print Bill" always re-queues (reprint with the same
    // number); the auto path only queues on the first bill so re-confirming an
    // already-billed order won't reprint it.
    let billNumber: number | undefined;
    if (printBill || update.status === "confirmed") {
      const existing = await db
        .collection("orders")
        .findOne({ _id }, { projection: { billNumber: 1 } });
      const firstBill = !existing?.billNumber;
      if (firstBill) {
        billNumber = await nextBillNumber(tenantId);
        update.billNumber = billNumber;
      } else {
        billNumber = existing!.billNumber as number;
      }
      if (printBill || firstBill) {
        update.billRequested = true;
        update.billPrinted = false;
      }
    }

    const result = await db
      .collection("orders")
      .updateOne({ _id }, { $set: { ...update, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      kotNumber,
      billNumber,
      confirmedAt,
    });
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 }
    );
  }
}
