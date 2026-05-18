import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

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

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, paymentStatus } = await req.json();
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Order id is required" },
        { status: 400 }
      );
    }

    const update: Record<string, string> = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, message: "Nothing to update" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection("orders")
      .updateOne({ _id: new ObjectId(id) }, { $set: { ...update, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 }
    );
  }
}
