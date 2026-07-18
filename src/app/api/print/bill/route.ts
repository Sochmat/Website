import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

/**
 * Print queue for customer bills, requested on demand from the admin panel.
 *
 *  GET  /api/print/bill      -> orders flagged for bill printing (enriched)
 *  POST /api/print/bill      -> { id } marks a bill as printed
 *
 * Both require Authorization: Bearer <PRINT_AGENT_TOKEN>.
 */

function authorize(req: NextRequest): NextResponse | null {
  const token = process.env.PRINT_AGENT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Print agent token not configured" },
      { status: 500 }
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided !== token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const unauthorized = authorize(req);
  if (unauthorized) return unauthorized;

  try {
    const { db } = await connectToDatabase();
    const orders = await db
      .collection("orders")
      .find({ billRequested: true, billPrinted: { $ne: true } })
      .sort({ updatedAt: 1 })
      .limit(20)
      .toArray();

    // Resolve product names for the line items.
    const productIds = new Set<string>();
    for (const order of orders) {
      for (const item of (order.orderItems ?? []) as Array<{
        productId?: string;
      }>) {
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
          .project({ name: 1 })
          .toArray()
      : [];

    const nameMap = new Map<string, string>();
    for (const p of products) nameMap.set(String(p._id), String(p.name ?? ""));

    const bills = orders.map((order) => {
      const items = ((order.orderItems ?? []) as Array<{
        productId?: string;
        quantity?: number;
        price?: number;
        variantName?: string;
        addOns?: Array<{ name?: string; price?: number; quantity?: number }>;
      }>).map((item) => ({
        name: item.productId
          ? nameMap.get(String(item.productId)) ?? "Unknown product"
          : "Unknown product",
        quantity: Number(item.quantity ?? 0),
        price: Number(item.price ?? 0),
        variantName: item.variantName ?? null,
        addOns: (item.addOns ?? []).map((addOn) => ({
          name: String(addOn?.name ?? ""),
          price: Number(addOn?.price ?? 0),
          quantity: Number(addOn?.quantity ?? 0),
        })),
      }));

      const subTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

      return {
        id: String(order._id),
        orderNumber: String(order.orderNumber ?? ""),
        billNumber: (order.billNumber as number | undefined) ?? null,
        createdAt: order.createdAt ?? null,
        method: String(order.method ?? "Delivery"),
        paymentMethod: String(order.paymentMethod ?? ""),
        paymentStatus: String(order.paymentStatus ?? ""),
        receiver: {
          name: (order.receiver as { name?: string })?.name ?? "",
          phone: (order.receiver as { phone?: string })?.phone ?? "",
          address: (order.receiver as { address?: string })?.address ?? "",
        },
        items,
        subTotal,
        discountAmount: Number(order.discountAmount ?? 0),
        tax: Number(order.tax ?? 0),
        deliveryFee: Number(order.deliveryFee ?? 0),
        totalAmount: Number(order.totalAmount ?? 0),
      };
    });

    return NextResponse.json({ success: true, bills });
  } catch (error) {
    console.error("Error building bill queue:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load bill queue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = authorize(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Order id is required" },
        { status: 400 }
      );
    }

    let _id: ObjectId;
    try {
      _id = new ObjectId(String(id));
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid order id" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection("orders").updateOne(
      { _id },
      {
        $set: {
          billPrinted: true,
          billRequested: false,
          billPrintedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error acking bill:", error);
    return NextResponse.json(
      { success: false, message: "Failed to mark bill printed" },
      { status: 500 }
    );
  }
}
