import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { kotDayKey, nextKotNumber, nextBillNumber } from "@/lib/kotCounter";

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
    const { id, status, paymentStatus, printBill } = await req.json();
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Order id is required" },
        { status: 400 }
      );
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
    const _id = new ObjectId(id);

    // On the first transition to "confirmed", allocate a daily KOT number and
    // queue the order for printing. Idempotent: re-confirming won't renumber.
    let kotNumber: number | undefined;
    if (update.status === "confirmed") {
      const existing = await db
        .collection("orders")
        .findOne({ _id }, { projection: { kotNumber: 1 } });
      if (existing && existing.kotNumber == null) {
        const day = kotDayKey();
        kotNumber = await nextKotNumber(db, day);
        update.kotNumber = kotNumber;
        update.kotDate = day;
        update.kotPrinted = false;
      } else if (existing) {
        kotNumber = existing.kotNumber as number;
      }
    }

    // "Print Bill": assign a global bill number once, then (re)queue the bill
    // for the print agent. Clicking again reprints with the same bill number.
    let billNumber: number | undefined;
    if (printBill) {
      const existing = await db
        .collection("orders")
        .findOne({ _id }, { projection: { billNumber: 1 } });
      if (existing && existing.billNumber == null) {
        billNumber = await nextBillNumber(db);
        update.billNumber = billNumber;
      } else if (existing) {
        billNumber = existing.billNumber as number;
      }
      update.billRequested = true;
      update.billPrinted = false;
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

    return NextResponse.json({ success: true, kotNumber, billNumber });
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 }
    );
  }
}
