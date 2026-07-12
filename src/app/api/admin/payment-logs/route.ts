import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

// Admin-only; enforced by the admin session check in src/middleware.ts for /api/admin/*.

/**
 * Recent payment-log rows, newest first. Filters:
 *   ?outcome=failure|success|info
 *   ?flow=order|subscription|unknown
 *   ?q=<substring>   — matches order/razorpay ids, stage, message, error
 *   ?limit=<n>       — default 200, max 1000
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const outcome = searchParams.get("outcome");
    const flow = searchParams.get("flow");
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 200, 1), 1000);

    const filter: Record<string, unknown> = {};
    if (outcome && ["failure", "success", "info"].includes(outcome)) filter.outcome = outcome;
    if (flow && ["order", "subscription", "unknown"].includes(flow)) filter.flow = flow;
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      filter.$or = [
        { orderId: rx },
        { razorpayOrderId: rx },
        { razorpayPaymentId: rx },
        { stage: rx },
        { message: rx },
        { error: rx },
      ];
    }

    const { db } = await connectToDatabase();
    const logs = await db
      .collection("paymentLogs")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // Lightweight counts for the header (failures in the last 24h).
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const failures24h = await db
      .collection("paymentLogs")
      .countDocuments({ outcome: "failure", createdAt: { $gte: since } });

    return NextResponse.json({ success: true, logs, failures24h });
  } catch (error) {
    console.error("Error fetching payment logs:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch payment logs" },
      { status: 500 },
    );
  }
}
