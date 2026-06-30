import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { forTenant } from "@/lib/tenantDb";
import { tenantIdForPrintToken } from "@/lib/printAuth";

/**
 * Print queue for the shop's KOT print agent.
 *
 *  GET  /api/print/kot       -> confirmed orders not yet printed (enriched)
 *  POST /api/print/kot       -> { id } marks an order as printed
 *
 * Both require Authorization: Bearer <per-tenant printAgentToken>.
 */

async function resolvetenant(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return tenantIdForPrintToken(token || null);
}

export async function GET(req: NextRequest) {
  const tenantId = await resolvetenant(req);
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const t = await forTenant(tenantId);
    const orders = await t
      .find("orders", { status: "confirmed", kotPrinted: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(20)
      .toArray();

    // Resolve product names for the line items (same lookup as admin list).
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
      ? await t
          .find("menuItems", { $or: orQuery })
          .project({ name: 1 })
          .toArray()
      : [];

    const nameMap = new Map<string, string>();
    for (const p of products) nameMap.set(String(p._id), String(p.name ?? ""));

    const tickets = orders.map((order) => ({
      id: String(order._id),
      orderNumber: String(order.orderNumber ?? ""),
      kotNumber: (order.kotNumber as number | undefined) ?? null,
      createdAt: order.createdAt ?? null,
      method: String(order.method ?? "Delivery"),
      paymentMethod: String(order.paymentMethod ?? ""),
      paymentStatus: String(order.paymentStatus ?? ""),
      totalAmount: Number(order.totalAmount ?? 0),
      receiver: {
        name: (order.receiver as { name?: string })?.name ?? "",
        phone: (order.receiver as { phone?: string })?.phone ?? "",
        address: (order.receiver as { address?: string })?.address ?? "",
      },
      items: ((order.orderItems ?? []) as Array<{
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
      })),
    }));

    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    console.error("Error building print queue:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load print queue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const tenantId = await resolvetenant(req);
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

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

    const t = await forTenant(tenantId);
    const result = await t.updateOne(
      "orders",
      { _id },
      { $set: { kotPrinted: true, kotPrintedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error acking print:", error);
    return NextResponse.json(
      { success: false, message: "Failed to mark printed" },
      { status: 500 }
    );
  }
}
