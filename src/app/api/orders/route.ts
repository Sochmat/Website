import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { Order, User } from "@/lib/types";

function generateOrderNumber() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SO-${t}-${r}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("_id");
    const gte = searchParams.get("gte");
    const lte = searchParams.get("lte");

    const { db } = await connectToDatabase();

    if (id) {
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(id) });
      return NextResponse.json({ success: true, order });
    }

    let filter: { createdAt?: { $gte?: Date; $lte?: Date } } = {};
    if (gte || lte) {
      if (gte) filter.createdAt = { $gte: new Date(gte) };
      if (lte) filter.createdAt = { $lte: new Date(lte) };
    }

    const orders = await db
      .collection("orders")
      .find({ ...filter })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Order;
    const phone = String(body.receiver?.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "user.phone is required" },
        { status: 400 }
      );
    }
    if (!body.orderItems?.length) {
      return NextResponse.json(
        { success: false, message: "orderItems are required" },
        { status: 400 }
      );
    }
    const totalAmount = Number(body.totalAmount);
    if (Number.isNaN(totalAmount) || totalAmount < 0) {
      return NextResponse.json(
        {
          success: false,
          message: "totalAmount is required and must be a number",
        },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    let user = (await db.collection("users").findOne({ phone })) as {
      _id: ObjectId;
      phone: string;
      name?: string;
    } | null;
    if (!user) {
      const newUser = {
        phone,
        name: body.receiver?.name ?? "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await db.collection("users").insertOne(newUser);
      user = {
        _id: insertResult.insertedId as ObjectId,
        phone,
        name: newUser.name,
      };
    }
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Failed to resolve user" },
        { status: 500 }
      );
    }

    let discountAmount = Number(body.discountAmount) ?? 0;
    if (body.couponCode) {
      const coupon = await db.collection("coupons").findOne({
        code: String(body.couponCode).trim().toUpperCase(),
        active: true,
      });
      if (coupon) {
        discountAmount = Number(coupon.discountAmount) || 0;
      }
    }

    const tax = Number(body.tax) ?? 0;
    const orderNumber = generateOrderNumber();

    const orderDoc: Order = {
      orderNumber,
      receiver: body.receiver
        ? {
            name: body.receiver.name ?? "",
            phone: String(body.receiver.phone ?? "").trim(),
            address: body.receiver.address ?? "",
          }
        : undefined,
      orderItems: body.orderItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
      })),
      totalAmount,
      discountAmount,
      tax,
      netAmount: totalAmount,
      couponCode: body.couponCode ?? undefined,
      paymentStatus: "pending" as const,
      status: "pending" as const,
      paymentMethod: body.paymentMethod ?? "cash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(orderDoc as any);
    const order = await db
      .collection("orders")
      .findOne({ _id: result.insertedId });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create order" },
      { status: 500 }
    );
  }
}
